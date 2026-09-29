// Package ejson implements TypeFerry's ordered, lossless JSON extension.
//
// Ordinary objects retain their insertion order because TypeFerry cache keys
// and wire fixtures observe that order. Tagged values use dedicated Value
// kinds; a plain object shaped like a tag is escaped on the wire. A Codec
// scopes custom-type factories to one application and is safe for concurrent
// parsing and registration.
package ejson
