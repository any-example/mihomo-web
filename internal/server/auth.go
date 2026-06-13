package server

import (
	"crypto/subtle"
	"net/http"
	"strings"
)

func (s *Server) withAuth(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if s.cfg.UISecret == "" {
			next(w, r)
			return
		}

		if s.validToken(r) {
			next(w, r)
			return
		}

		http.Redirect(w, r, "/login", http.StatusFound)
	}
}

func (s *Server) validToken(r *http.Request) bool {
	token := r.URL.Query().Get("ui_secret")
	if token == "" {
		auth := r.Header.Get("Authorization")
		token = strings.TrimPrefix(auth, "Bearer ")
	}
	if token == "" {
		cookie, err := r.Cookie("mihomo_web_token")
		if err == nil {
			token = cookie.Value
		}
	}
	if token == "" {
		return false
	}
	return subtle.ConstantTimeCompare([]byte(token), []byte(s.cfg.UISecret)) == 1
}
