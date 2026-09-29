package auth

import (
	"strings"
	"testing"
)

func TestRefreshCookieRoundTrip(t *testing.T) {
	options := CookieOptions{Name: "refresh", MaxAgeDays: 14, SameSite: "Lax", Path: "/"}
	value := SetRefreshTokenCookie("part one;+", options, true)
	if !strings.Contains(value, "HttpOnly") || !strings.Contains(value, "Secure") || !strings.Contains(value, "Max-Age=1209600") {
		t.Fatalf("cookie = %q", value)
	}
	if got := RefreshTokenFromCookieHeader(value, options.Name); got != "part one;+" {
		t.Fatalf("token = %q", got)
	}
	clear := ClearRefreshTokenCookie(options, true)
	if !strings.Contains(clear, "Max-Age=0") {
		t.Fatalf("clear = %q", clear)
	}
}
