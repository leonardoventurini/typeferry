package auth

import (
	"strings"
	"testing"
	"time"
)

func testConfig() Config {
	return Config{Secret: []byte("test-secret"), Algorithm: HS256, AccessTokenExpiry: 15 * time.Minute, RefreshTokenExpiry: 14 * 24 * time.Hour, RotationGracePeriod: 15 * time.Second}
}

func TestAccessTokenSigningAndVerification(t *testing.T) {
	config := testConfig()
	issued := time.Unix(1_700_000_000, 0)
	payload := AccessTokenPayload{UserID: "user", SessionID: "session", IssuedAt: issued.Unix(), ExpiresAt: issued.Add(15 * time.Minute).Unix(), Claims: map[string]any{"scope": "write"}}
	token, err := SignAccessToken(payload, config)
	if err != nil {
		t.Fatal(err)
	}
	for _, input := range []string{token, "Bearer " + token} {
		decoded, err := VerifyAccessToken(input, config, issued.Add(time.Minute))
		if err != nil || decoded.UserID != payload.UserID || decoded.SessionID != payload.SessionID || decoded.Claims["scope"] != "write" {
			t.Fatalf("verify = %#v, %v", decoded, err)
		}
	}
	parts := strings.Split(token, ".")
	parts[1] = parts[1][:len(parts[1])-1] + "x"
	if _, err := VerifyAccessToken(strings.Join(parts, "."), config, issued); err == nil {
		t.Fatal("tampered token accepted")
	}
	if _, err := VerifyAccessToken(token, config, issued.Add(16*time.Minute)); err == nil {
		t.Fatal("expired token accepted")
	}
	if _, err := VerifyAccessToken(token, config, issued.Add(-time.Second)); err == nil {
		t.Fatal("future token accepted")
	}
}

func TestSessionRotationGraceAndFamilyRevocation(t *testing.T) {
	config := testConfig()
	now := time.Unix(1_700_000_000, 0)
	manager, err := NewInMemorySessionManager(config, func() time.Time { return now })
	if err != nil {
		t.Fatal(err)
	}
	first, err := manager.CreateSession("user", nil)
	if err != nil {
		t.Fatal(err)
	}
	second, err := manager.RefreshSession(first.RefreshToken, nil)
	if err != nil || second.RefreshToken == first.RefreshToken {
		t.Fatalf("rotate = %#v, %v", second, err)
	}
	now = now.Add(10 * time.Second)
	grace, err := manager.RefreshSession(first.RefreshToken, nil)
	if err != nil || grace.RefreshToken != second.RefreshToken {
		t.Fatalf("grace = %#v, %v", grace, err)
	}
	now = now.Add(6 * time.Second)
	if _, err := manager.RefreshSession(first.RefreshToken, nil); err == nil {
		t.Fatal("replay after grace accepted")
	}
	if _, err := manager.RefreshSession(second.RefreshToken, nil); err == nil {
		t.Fatal("replayed family remained active")
	}
	if sessions := manager.UserSessions("user"); len(sessions) != 0 {
		t.Fatalf("sessions = %v", sessions)
	}
}

func TestSupportedAlgorithmsAndSessionRevocation(t *testing.T) {
	for _, algorithm := range []Algorithm{HS256, HS384, HS512} {
		config := testConfig()
		config.Algorithm = algorithm
		manager, err := NewInMemorySessionManager(config, nil)
		if err != nil {
			t.Fatal(err)
		}
		first, err := manager.CreateSession("user", &DeviceInfo{IP: "192.0.2.1"})
		if err != nil {
			t.Fatal(err)
		}
		if _, err := VerifyAccessToken(first.AccessToken, config, time.Now()); err != nil {
			t.Fatal(err)
		}
		session, ok := manager.SessionFor(first.RefreshToken)
		if !ok || session.DeviceInfo.IP != "192.0.2.1" {
			t.Fatal("created session not found")
		}
		if !manager.RevokeSession(session.ID) {
			t.Fatal("session was not revoked")
		}
		if _, err := manager.RefreshSession(first.RefreshToken, nil); err == nil {
			t.Fatal("revoked session refreshed")
		}
		if removed := manager.Cleanup(); removed != 1 {
			t.Fatalf("cleanup removed %d sessions", removed)
		}
	}
}
