package auth

import (
	"context"
	"crypto"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"math/big"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestGoogleCodeExchangeVerifiesIDToken(t *testing.T) {
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	claims := map[string]any{"iss": "https://accounts.google.com", "aud": "client-id", "sub": "google-user", "email": "user@example.test", "email_verified": true, "exp": time.Now().Add(time.Hour).Unix(), "iat": time.Now().Add(-time.Minute).Unix()}
	var token string
	server := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		switch request.URL.Path {
		case "/token":
			if request.Method != http.MethodPost || request.FormValue("code") != "good-code" || request.FormValue("grant_type") != "authorization_code" {
				http.Error(response, "bad exchange", http.StatusBadRequest)
				return
			}
			_ = json.NewEncoder(response).Encode(map[string]string{"id_token": token})
		case "/keys":
			_ = json.NewEncoder(response).Encode(map[string]any{"keys": []map[string]string{{"kid": "test-key", "kty": "RSA", "alg": "RS256", "n": base64.RawURLEncoding.EncodeToString(key.N.Bytes()), "e": base64.RawURLEncoding.EncodeToString(big.NewInt(int64(key.E)).Bytes())}}})
		default:
			http.NotFound(response, request)
		}
	}))
	defer server.Close()
	provider := NewGoogleProvider(GoogleConfig{ClientID: "client-id", ClientSecret: "client-secret", TokenEndpoint: server.URL + "/token", JWKSEndpoint: server.URL + "/keys"}, server.Client())
	token = signedGoogleToken(t, key, claims)
	user, err := provider.ExchangeCode(context.Background(), "good-code")
	if err != nil || user.ProviderID != "google-user" || user.Email != "user@example.test" || !user.EmailVerified {
		t.Fatalf("Google user = %#v, %v", user, err)
	}
	claims["aud"] = "wrong-client"
	token = signedGoogleToken(t, key, claims)
	if _, err := provider.ExchangeCode(context.Background(), "good-code"); err == nil {
		t.Fatal("wrong audience accepted")
	}
	claims["aud"] = "client-id"
	claims["iss"] = "https://wrong.example.test"
	token = signedGoogleToken(t, key, claims)
	if _, err := provider.ExchangeCode(context.Background(), "good-code"); err == nil {
		t.Fatal("wrong issuer accepted")
	}
	claims["iss"] = "https://accounts.google.com"
	claims["exp"] = time.Now().Add(-time.Minute).Unix()
	token = signedGoogleToken(t, key, claims)
	if _, err := provider.ExchangeCode(context.Background(), "good-code"); err == nil {
		t.Fatal("expired token accepted")
	}
	claims["exp"] = time.Now().Add(time.Hour).Unix()
	token = signedGoogleToken(t, key, claims)
	parts := strings.Split(token, ".")
	parts[2] = "x" + parts[2][1:]
	token = strings.Join(parts, ".")
	if _, err := provider.ExchangeCode(context.Background(), "good-code"); err == nil {
		t.Fatal("invalid signature accepted")
	}
}

func signedGoogleToken(t *testing.T, key *rsa.PrivateKey, claims map[string]any) string {
	t.Helper()
	header, _ := json.Marshal(map[string]string{"alg": "RS256", "kid": "test-key"})
	body, err := json.Marshal(claims)
	if err != nil {
		t.Fatal(err)
	}
	unsigned := base64.RawURLEncoding.EncodeToString(header) + "." + base64.RawURLEncoding.EncodeToString(body)
	digest := sha256.Sum256([]byte(unsigned))
	signature, err := rsa.SignPKCS1v15(rand.Reader, key, crypto.SHA256, digest[:])
	if err != nil {
		t.Fatal(err)
	}
	return unsigned + "." + base64.RawURLEncoding.EncodeToString(signature)
}
