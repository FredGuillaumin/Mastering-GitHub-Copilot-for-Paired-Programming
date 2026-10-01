# Utiliser l'API Claude en C++

Petit chat en ligne de commande qui appelle l'API Claude (`POST /v1/messages`).
Anthropic ne publie pas de SDK C++ : l'exemple utilise directement l'API HTTP
avec [libcurl](https://curl.se/libcurl/) et [nlohmann/json](https://github.com/nlohmann/json).

## Prérequis

```bash
# Debian / Ubuntu
sudo apt-get install -y g++ cmake libcurl4-openssl-dev nlohmann-json3-dev
# macOS
brew install cmake curl nlohmann-json
```

## Compiler et lancer

```bash
cmake -S . -B build
cmake --build build
export ANTHROPIC_API_KEY="votre-clé"
./build/claude_chat
```

## Ce que montre l'exemple

- Les en-têtes obligatoires : `x-api-key`, `anthropic-version`, `content-type`.
- Une conversation multi-tours : l'historique complet est renvoyé à chaque requête,
  et le contenu de la réponse de l'assistant est ajouté **tel quel** (blocs `thinking` compris).
- La vérification de `stop_reason` (`refusal`, `max_tokens`) avant de lire le texte.
- Le repli automatique côté serveur (`fallbacks: "default"` + en-tête bêta
  `server-side-fallback-2026-07-01`) si une requête est refusée par les classifieurs.
- La gestion des erreurs HTTP (le message est lu dans `error.message`).

Le modèle utilisé est `claude-opus-5-5` (modifiable via `kModel` dans `main.cpp`).
