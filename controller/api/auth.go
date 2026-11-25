package api

import (
	"crypto/subtle"
	"net/http"
	"strings"
)

// Authentification par clé partagée.
//
// IMPORTANT : la vérification d'origine de cors() ne protège que contre les pages web d'un navigateur. Un autre
// programme de la machine (un script, un logiciel malveillant) n'envoie pas d'en-tête Origin et pouvait appeler
// toute l'API — changer la vitesse du ventilateur, arrêter le contrôleur — alors qu'il tourne en SYSTEM. La clé
// ferme cette porte : elle vit dans un fichier lisible seulement par SYSTEM et les administrateurs (voir keyfile.go
// côté main), et l'interface, qui s'exécute en administrateur, la lit et l'envoie à chaque requête.

// authExemptPath : routes accessibles sans clé. /health ne renvoie rien de sensible et sert à savoir si le contrôleur
// est vivant avant même que l'interface ait pu lire la clé.
const authExemptPath = "/health"

// SetKey définit la clé attendue. Sans clé, le serveur refuse TOUTES les requêtes authentifiées (échec fermé) :
// oublier de la définir doit se voir tout de suite, pas ouvrir l'API.
func (s *Server) SetKey(key string) { s.key = key }

// requireKey rejette toute requête qui ne présente pas la clé.
//
// La clé se présente dans l'en-tête `Authorization: Bearer <clé>`. Seule exception : GET /events accepte aussi le
// paramètre `?token=`, parce qu'un EventSource de navigateur ne peut pas envoyer d'en-tête. Le paramètre n'est pas
// accepté ailleurs, pour que la clé n'apparaisse pas dans les adresses des autres requêtes.
func requireKey(key string, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Le pré-contrôle CORS (OPTIONS) ne porte jamais d'en-tête Authorization : cors() l'a déjà traité avant nous.
		if r.Method == http.MethodOptions || r.URL.Path == authExemptPath {
			next.ServeHTTP(w, r)
			return
		}
		if key == "" || !keyMatches(key, presentedKey(r)) {
			w.Header().Set("WWW-Authenticate", `Bearer realm="fanctl"`)
			errJSON(w, http.StatusUnauthorized, "missing or invalid key")
			return
		}
		next.ServeHTTP(w, r)
	})
}

// presentedKey extrait la clé de la requête (voir requireKey).
func presentedKey(r *http.Request) string {
	if h := r.Header.Get("Authorization"); strings.HasPrefix(h, "Bearer ") {
		return strings.TrimPrefix(h, "Bearer ")
	}
	if r.Method == http.MethodGet && r.URL.Path == "/events" {
		return r.URL.Query().Get("token")
	}
	return ""
}

// keyMatches compare en temps constant : une comparaison ordinaire s'arrêterait au premier octet différent et
// laisserait deviner la clé octet par octet en mesurant les temps de réponse.
func keyMatches(want, got string) bool {
	return subtle.ConstantTimeCompare([]byte(want), []byte(got)) == 1
}
