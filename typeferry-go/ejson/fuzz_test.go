package ejson

import (
	"testing"
	"unicode/utf8"
)

func FuzzParseAndStringRoundTrip(f *testing.F) {
	for _, seed := range []string{"", "null", "{}", `{"$date":0}`, `{"$type":"escape","$value":{"$date":1}}`, "\x00\xff"} {
		f.Add(seed)
	}
	f.Fuzz(func(t *testing.T, input string) {
		codec := NewCodec()
		_, _ = codec.Parse(input)
		if !utf8.ValidString(input) {
			return
		}
		encoded, err := codec.Stringify(String(input), false)
		if err != nil {
			t.Fatal(err)
		}
		decoded, err := codec.Parse(encoded)
		if err != nil {
			t.Fatal(err)
		}
		value, ok := decoded.Text()
		if !ok || value != input {
			t.Fatalf("round-trip = %q, want %q", value, input)
		}
	})
}
