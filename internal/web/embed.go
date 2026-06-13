package web

import "embed"

// Templates contains server-rendered HTML templates.
//
//go:embed templates/*.gohtml
var Templates embed.FS

// Static contains browser assets.
//
//go:embed static/*
var Static embed.FS
