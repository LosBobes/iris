// Package api contains the HTTP transport layer for the Iris API.
//
// It is responsible for:
// - registering routes and middleware
// - decoding incoming HTTP requests
// - delegating data access to the store layer
// - encoding HTTP responses
//
// This package should stay focused on HTTP concerns. Domain modeling lives in
// package domain, and fixture-backed data access lives in package store.
package api
