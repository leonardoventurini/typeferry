package auth

import (
	"bytes"
	"context"
	"crypto"
	"crypto/rsa"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math/big"
	"net/http"
	"net/url"
	"strings"
	"time"
)

const (
	googleTokenEndpoint   = "https://oauth2.googleapis.com/token"
	googleJWKSEndpoint    = "https://www.googleapis.com/oauth2/v3/certs"
	maxOAuthResponseBytes = 1 << 20
)

type GoogleConfig struct {
	ClientID      string
	ClientSecret  string
	RedirectURI   string
	TokenEndpoint string
	JWKSEndpoint  string
}

type GoogleUser struct {
	ProviderID    string
	Provider      string
	Email         string
	EmailVerified bool
	Name          string
	Picture       string
	Raw           map[string]any
}

type GoogleProvider struct {
	config GoogleConfig
	client *http.Client
}

type googleKey struct {
	ID        string `json:"kid"`
	Type      string `json:"kty"`
	Algorithm string `json:"alg"`
	Modulus   string `json:"n"`
	Exponent  string `json:"e"`
}

func NewGoogleProvider(config GoogleConfig, client *http.Client) *GoogleProvider {
	if config.RedirectURI == "" {
		config.RedirectURI = "postmessage"
	}
	if config.TokenEndpoint == "" {
		config.TokenEndpoint = googleTokenEndpoint
	}
	if config.JWKSEndpoint == "" {
		config.JWKSEndpoint = googleJWKSEndpoint
	}
	if client == nil {
		client = &http.Client{Timeout: 10 * time.Second}
	}
	return &GoogleProvider{config: config, client: client}
}

func (provider *GoogleProvider) ExchangeCode(ctx context.Context, code string) (GoogleUser, error) {
	if code == "" || provider.config.ClientID == "" {
		return GoogleUser{}, errors.New("Google code and client ID are required")
	}
	form := url.Values{
		"code":          {code},
		"client_id":     {provider.config.ClientID},
		"client_secret": {provider.config.ClientSecret},
		"redirect_uri":  {provider.config.RedirectURI},
		"grant_type":    {"authorization_code"},
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, provider.config.TokenEndpoint, strings.NewReader(form.Encode()))
	if err != nil {
		return GoogleUser{}, err
	}
	request.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	var exchange struct {
		IDToken string `json:"id_token"`
	}
	if err := provider.fetchJSON(request, &exchange); err != nil {
		return GoogleUser{}, err
	}
	if exchange.IDToken == "" {
		return GoogleUser{}, errors.New("Google OAuth response missing id_token")
	}
	keyRequest, err := http.NewRequestWithContext(ctx, http.MethodGet, provider.config.JWKSEndpoint, nil)
	if err != nil {
		return GoogleUser{}, err
	}
	var keys struct {
		Keys []googleKey `json:"keys"`
	}
	if err := provider.fetchJSON(keyRequest, &keys); err != nil {
		return GoogleUser{}, err
	}
	claims, err := verifyGoogleToken(exchange.IDToken, provider.config.ClientID, keys.Keys, time.Now())
	if err != nil {
		return GoogleUser{}, err
	}
	user := GoogleUser{ProviderID: stringClaim(claims, "sub"), Provider: "google", Email: stringClaim(claims, "email"),
		Name: stringClaim(claims, "name"), Picture: stringClaim(claims, "picture"), Raw: claims}
	user.EmailVerified, _ = claims["email_verified"].(bool)
	if user.ProviderID == "" {
		return GoogleUser{}, errors.New("Google ID token has no subject")
	}
	return user, nil
}

func (provider *GoogleProvider) fetchJSON(request *http.Request, target any) error {
	response, err := provider.client.Do(request)
	if err != nil {
		return err
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return fmt.Errorf("Google OAuth HTTP %d", response.StatusCode)
	}
	body, err := io.ReadAll(io.LimitReader(response.Body, maxOAuthResponseBytes+1))
	if err != nil {
		return err
	}
	if len(body) > maxOAuthResponseBytes {
		return errors.New("Google OAuth response is oversized")
	}
	decoder := json.NewDecoder(bytes.NewReader(body))
	if err := decoder.Decode(target); err != nil {
		return err
	}
	var extra any
	if err := decoder.Decode(&extra); err != io.EOF {
		return errors.New("Google OAuth response is oversized or has trailing data")
	}
	return nil
}

func verifyGoogleToken(token, audience string, keys []googleKey, now time.Time) (map[string]any, error) {
	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		return nil, errors.New("invalid Google ID token")
	}
	headerBytes, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil {
		return nil, err
	}
	var header struct {
		Algorithm string `json:"alg"`
		KeyID     string `json:"kid"`
	}
	if err := json.Unmarshal(headerBytes, &header); err != nil || header.Algorithm != "RS256" || header.KeyID == "" {
		return nil, errors.New("unsupported Google ID token header")
	}
	var selected *rsa.PublicKey
	for _, key := range keys {
		if key.ID != header.KeyID || key.Type != "RSA" || key.Algorithm != "RS256" {
			continue
		}
		modulus, err := base64.RawURLEncoding.DecodeString(key.Modulus)
		if err != nil {
			return nil, err
		}
		exponent, err := base64.RawURLEncoding.DecodeString(key.Exponent)
		if err != nil {
			return nil, err
		}
		n := new(big.Int).SetBytes(modulus)
		e := new(big.Int).SetBytes(exponent)
		if n.BitLen() < 2048 || !e.IsInt64() || e.Sign() <= 0 || e.Int64() > 1<<31-1 {
			return nil, errors.New("invalid Google signing key")
		}
		selected = &rsa.PublicKey{N: n, E: int(e.Int64())}
		break
	}
	if selected == nil {
		return nil, errors.New("Google signing key was not found")
	}
	signature, err := base64.RawURLEncoding.DecodeString(parts[2])
	if err != nil {
		return nil, err
	}
	digest := sha256.Sum256([]byte(parts[0] + "." + parts[1]))
	if err := rsa.VerifyPKCS1v15(selected, crypto.SHA256, digest[:], signature); err != nil {
		return nil, err
	}
	body, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return nil, err
	}
	var claims map[string]any
	if err := json.Unmarshal(body, &claims); err != nil || claims == nil {
		return nil, errors.New("invalid Google ID token claims")
	}
	issuer := stringClaim(claims, "iss")
	if issuer != "accounts.google.com" && issuer != "https://accounts.google.com" {
		return nil, errors.New("invalid Google issuer")
	}
	if stringClaim(claims, "aud") != audience {
		return nil, errors.New("invalid Google audience")
	}
	expiry, ok := numberClaim(claims, "exp")
	if !ok || now.Unix() >= expiry {
		return nil, errors.New("expired Google ID token")
	}
	issued, ok := numberClaim(claims, "iat")
	if !ok || issued > now.Unix() {
		return nil, errors.New("invalid Google issuance time")
	}
	return claims, nil
}

func stringClaim(claims map[string]any, name string) string {
	value, _ := claims[name].(string)
	return value
}

func numberClaim(claims map[string]any, name string) (int64, bool) {
	value, ok := claims[name].(float64)
	if !ok || value != float64(int64(value)) {
		return 0, false
	}
	return int64(value), true
}
