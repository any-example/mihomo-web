package main

import (
	"flag"
	"fmt"
	"log"
	"os"

	"github.com/ming/mihomo-web/internal/server"
)

var (
	_version = "dev"
	_commit  = "unknown"
	_date    = "unknown"
)

func main() {
	if err := run(); err != nil {
		log.Fatal(err)
	}
}

func run() error {
	var showVersion bool
	cfg := server.Config{}
	flag.StringVar(&cfg.Listen, "listen", envOr("MIHOMO_WEB_LISTEN", "127.0.0.1:8080"), "HTTP listen address")
	flag.StringVar(&cfg.MihomoURL, "mihomo-url", envOr("MIHOMO_URL", ""), "mihomo external-controller URL")
	flag.StringVar(&cfg.MihomoSecret, "secret", envOr("MIHOMO_SECRET", ""), "mihomo external-controller secret")
	flag.StringVar(&cfg.UISecret, "ui-secret", envOr("MIHOMO_WEB_SECRET", ""), "mihomo-web access token; empty disables auth")
	flag.BoolVar(&cfg.ReadOnly, "read-only", envBool("MIHOMO_WEB_READ_ONLY"), "disable write operations")
	flag.BoolVar(&showVersion, "version", false, "print version and exit")
	flag.Parse()

	cfg.Build = server.BuildInfo{Version: _version, Commit: _commit, Date: _date}
	if showVersion {
		fmt.Printf("mihomo-web %s commit=%s date=%s\n", cfg.Build.Version, cfg.Build.Commit, cfg.Build.Date)
		return nil
	}

	s, err := server.New(cfg, log.Default())
	if err != nil {
		return fmt.Errorf("new server: %w", err)
	}

	log.Printf("mihomo-web listening on http://%s", cfg.Listen)
	if cfg.UISecret == "" {
		log.Printf("ui auth disabled because --ui-secret is empty")
	}
	if cfg.MihomoURL == "" {
		log.Printf("mihomo target is not fixed; configure it in browser")
	}
	return s.ListenAndServe()
}

func envOr(name string, fallback string) string {
	value := os.Getenv(name)
	if value == "" {
		return fallback
	}
	return value
}

func envBool(name string) bool {
	value := os.Getenv(name)
	return value == "1" || value == "true" || value == "TRUE" || value == "yes" || value == "YES"
}
