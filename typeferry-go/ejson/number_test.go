package ejson

import (
	"math"
	"math/big"
	"strconv"
	"testing"
)

func TestNumberTextRetainsParsedSpellingWithoutChangingWireEncoding(t *testing.T) {
	codec := NewCodec()
	for _, exponent := range []uint{63, 64, 80, 128, 256} {
		integer := new(big.Int).Lsh(big.NewInt(1), exponent)
		integer.Add(integer, big.NewInt(3))
		for _, sign := range []int64{1, -1} {
			source := new(big.Int).Mul(integer, big.NewInt(sign)).String()
			parsed, err := codec.Parse(source)
			if err != nil {
				t.Fatal(err)
			}
			retained := Array(Object(Field{Key: "number", Value: parsed})).Items()[0]
			value, _ := retained.Lookup("number")
			if text, valid := value.NumberText(); !valid || text != source {
				t.Fatalf("number spelling = %q %v, want %q", text, valid, source)
			}
			approximation, valid := value.Number()
			if !valid {
				t.Fatal("finite numeric approximation unavailable")
			}
			encoded, err := codec.Stringify(value, false)
			if err != nil {
				t.Fatal(err)
			}
			usual, err := codec.Stringify(Float(approximation), false)
			if err != nil || encoded != usual {
				t.Fatalf("wire changed: %s != %s (%v)", encoded, usual, err)
			}
		}
	}
	for _, source := range []string{"1.0", "1e20", "1.000e-07", "-0.0", "-0"} {
		value, err := codec.Parse(source)
		if err != nil {
			t.Fatal(err)
		}
		if text, valid := value.NumberText(); !valid || text != source {
			t.Fatalf("float spelling = %q %v, want %q", text, valid, source)
		}
	}
	for _, value := range []Value{Null(), String("1"), Date(1), Float(math.Inf(1)), Float(math.NaN())} {
		if text, valid := value.NumberText(); valid || text != "" {
			t.Fatalf("nonfinite or nonnumber spelling = %q %v", text, valid)
		}
	}
	for _, number := range []int64{-1, 0, 1} {
		if text, valid := Int(number).NumberText(); !valid || text != strconv.FormatInt(number, 10) {
			t.Fatalf("constructed integer = %q %v", text, valid)
		}
	}
}
