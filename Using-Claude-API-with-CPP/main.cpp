// Petit exemple de chat en ligne de commande avec l'API Claude, en C++.
//
// Il n'existe pas de SDK officiel Anthropic pour C++ : on appelle donc
// directement l'API HTTP (POST /v1/messages) avec libcurl, et on manipule
// le JSON avec nlohmann/json.

#include <curl/curl.h>
#include <nlohmann/json.hpp>

#include <cstdlib>
#include <iostream>
#include <stdexcept>
#include <string>

using json = nlohmann::json;

namespace {

constexpr const char* kApiUrl = "https://api.anthropic.com/v1/messages";
constexpr const char* kModel = "claude-opus-5-5";

// libcurl appelle cette fonction pour chaque morceau de la réponse HTTP.
size_t WriteCallback(char* data, size_t size, size_t nmemb, void* userp) {
    auto* buffer = static_cast<std::string*>(userp);
    buffer->append(data, size * nmemb);
    return size * nmemb;
}

class ClaudeClient {
public:
    explicit ClaudeClient(std::string apiKey) : apiKey_(std::move(apiKey)) {}

    // Envoie la conversation complète et renvoie la réponse JSON de l'API.
    json SendMessages(const json& messages, const std::string& system) {
        json body = {
            {"model", kModel},
            {"max_tokens", 16000},
            {"system", system},
            {"messages", messages},
            // Si la requête est refusée par les classifieurs de sécurité,
            // l'API la rejoue automatiquement sur un modèle de repli.
            {"fallbacks", "default"},
        };

        CURL* curl = curl_easy_init();
        if (!curl) throw std::runtime_error("curl_easy_init a échoué");

        std::string apiKeyHeader = "x-api-key: " + apiKey_;
        curl_slist* headers = nullptr;
        headers = curl_slist_append(headers, "content-type: application/json");
        headers = curl_slist_append(headers, "anthropic-version: 2023-06-01");
        headers = curl_slist_append(headers, "anthropic-beta: server-side-fallback-2026-07-01");
        headers = curl_slist_append(headers, apiKeyHeader.c_str());

        const std::string payload = body.dump();
        std::string response;

        curl_easy_setopt(curl, CURLOPT_URL, kApiUrl);
        curl_easy_setopt(curl, CURLOPT_HTTPHEADER, headers);
        curl_easy_setopt(curl, CURLOPT_POSTFIELDS, payload.c_str());
        curl_easy_setopt(curl, CURLOPT_WRITEFUNCTION, WriteCallback);
        curl_easy_setopt(curl, CURLOPT_WRITEDATA, &response);
        curl_easy_setopt(curl, CURLOPT_TIMEOUT, 600L);

        CURLcode res = curl_easy_perform(curl);
        long status = 0;
        curl_easy_getinfo(curl, CURLINFO_RESPONSE_CODE, &status);
        curl_slist_free_all(headers);
        curl_easy_cleanup(curl);

        if (res != CURLE_OK) {
            throw std::runtime_error(std::string("Erreur réseau : ") + curl_easy_strerror(res));
        }

        json result = json::parse(response, nullptr, /*allow_exceptions=*/false);
        if (status != 200) {
            std::string message = result.is_object() && result.contains("error")
                                      ? result["error"].value("message", response)
                                      : response;
            throw std::runtime_error("Erreur HTTP " + std::to_string(status) + " : " + message);
        }
        if (result.is_discarded()) throw std::runtime_error("Réponse JSON invalide");
        return result;
    }

private:
    std::string apiKey_;
};

// Concatène tous les blocs de type "text" de la réponse.
std::string ExtractText(const json& response) {
    std::string text;
    for (const auto& block : response["content"]) {
        if (block.value("type", "") == "text") text += block.value("text", "");
    }
    return text;
}

}  // namespace

int main() {
    const char* apiKey = std::getenv("ANTHROPIC_API_KEY");
    if (!apiKey || !*apiKey) {
        std::cerr << "Définissez la variable d'environnement ANTHROPIC_API_KEY.\n";
        return 1;
    }

    curl_global_init(CURL_GLOBAL_DEFAULT);
    ClaudeClient client(apiKey);

    const std::string system = "Tu es un assistant concis qui répond en français.";
    json messages = json::array();  // historique de la conversation

    std::cout << "Chat avec Claude (" << kModel << "). Tapez 'quit' pour sortir.\n";
    std::string input;
    while (std::cout << "\nVous > " && std::getline(std::cin, input)) {
        if (input == "quit") break;
        if (input.empty()) continue;

        messages.push_back({{"role", "user"}, {"content", input}});

        try {
            json response = client.SendMessages(messages, system);

            // Toujours vérifier stop_reason avant de lire le contenu.
            const std::string stopReason = response.value("stop_reason", "");
            if (stopReason == "refusal") {
                std::cout << "Claude > (requête refusée)\n";
                messages.erase(messages.end() - 1);  // on retire la question refusée
                continue;
            }

            std::cout << "Claude > " << ExtractText(response) << "\n";
            if (stopReason == "max_tokens") std::cout << "(réponse tronquée : max_tokens atteint)\n";

            // On renvoie le contenu complet (y compris les blocs "thinking")
            // tel quel au tour suivant, et non seulement le texte.
            messages.push_back({{"role", "assistant"}, {"content", response["content"]}});

            const auto& usage = response["usage"];
            std::cout << "[tokens : " << usage.value("input_tokens", 0) << " en entrée, "
                      << usage.value("output_tokens", 0) << " en sortie]\n";
        } catch (const std::exception& e) {
            std::cerr << e.what() << "\n";
            messages.erase(messages.end() - 1);
        }
    }

    curl_global_cleanup();
    return 0;
}
