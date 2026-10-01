// Petit exemple CUDA : addition de deux vecteurs sur le GPU.
//
// Le programme :
//   1. affiche les caractéristiques de la carte graphique ;
//   2. additionne deux vecteurs de 50 millions de nombres sur le CPU puis sur le GPU ;
//   3. vérifie que les résultats sont identiques et compare les temps.
//
// Compilation pour une Quadro RTX 3000 (architecture Turing, sm_75) :
//   nvcc -O2 -arch=sm_75 vector_add.cu -o vector_add

#include <cuda_runtime.h>

#include <chrono>
#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <vector>

// Vérifie le code de retour de chaque appel CUDA et arrête le programme en cas d'erreur.
#define CUDA_CHECK(call)                                                        \
    do {                                                                        \
        cudaError_t err = (call);                                               \
        if (err != cudaSuccess) {                                               \
            std::fprintf(stderr, "Erreur CUDA %s:%d : %s\n", __FILE__, __LINE__, \
                         cudaGetErrorString(err));                              \
            std::exit(EXIT_FAILURE);                                            \
        }                                                                       \
    } while (0)

// Le kernel : chaque thread du GPU calcule un seul élément du résultat.
__global__ void VectorAdd(const float* a, const float* b, float* c, int n) {
    int i = blockIdx.x * blockDim.x + threadIdx.x;
    if (i < n) c[i] = a[i] + b[i];
}

void PrintDeviceInfo() {
    int device = 0;
    CUDA_CHECK(cudaGetDevice(&device));
    cudaDeviceProp prop{};
    CUDA_CHECK(cudaGetDeviceProperties(&prop, device));
    std::printf("Carte graphique   : %s\n", prop.name);
    std::printf("Compute capability: %d.%d\n", prop.major, prop.minor);
    std::printf("Mémoire           : %.1f Go\n", prop.totalGlobalMem / (1024.0 * 1024.0 * 1024.0));
    std::printf("Multiprocesseurs  : %d\n\n", prop.multiProcessorCount);
}

int main() {
    PrintDeviceInfo();

    const int n = 50'000'000;
    const size_t bytes = n * sizeof(float);

    // Données sur le CPU (« host »).
    std::vector<float> a(n), b(n), cCpu(n), cGpu(n);
    for (int i = 0; i < n; ++i) {
        a[i] = std::sin(i) * 0.5f;
        b[i] = std::cos(i) * 0.5f;
    }

    // --- Calcul sur le CPU, pour comparaison ---
    auto t0 = std::chrono::high_resolution_clock::now();
    for (int i = 0; i < n; ++i) cCpu[i] = a[i] + b[i];
    auto t1 = std::chrono::high_resolution_clock::now();
    double cpuMs = std::chrono::duration<double, std::milli>(t1 - t0).count();

    // --- Calcul sur le GPU (« device ») ---
    float *dA = nullptr, *dB = nullptr, *dC = nullptr;
    CUDA_CHECK(cudaMalloc(&dA, bytes));
    CUDA_CHECK(cudaMalloc(&dB, bytes));
    CUDA_CHECK(cudaMalloc(&dC, bytes));

    cudaEvent_t start, stop;
    CUDA_CHECK(cudaEventCreate(&start));
    CUDA_CHECK(cudaEventCreate(&stop));

    // Copie des données du CPU vers la mémoire de la carte.
    CUDA_CHECK(cudaMemcpy(dA, a.data(), bytes, cudaMemcpyHostToDevice));
    CUDA_CHECK(cudaMemcpy(dB, b.data(), bytes, cudaMemcpyHostToDevice));

    // 256 threads par bloc, et assez de blocs pour couvrir les n éléments.
    const int threadsPerBlock = 256;
    const int blocks = (n + threadsPerBlock - 1) / threadsPerBlock;

    CUDA_CHECK(cudaEventRecord(start));
    VectorAdd<<<blocks, threadsPerBlock>>>(dA, dB, dC, n);
    CUDA_CHECK(cudaGetLastError());  // erreur de lancement du kernel
    CUDA_CHECK(cudaEventRecord(stop));
    CUDA_CHECK(cudaEventSynchronize(stop));

    float gpuMs = 0.0f;
    CUDA_CHECK(cudaEventElapsedTime(&gpuMs, start, stop));

    // Copie du résultat de la carte vers le CPU.
    CUDA_CHECK(cudaMemcpy(cGpu.data(), dC, bytes, cudaMemcpyDeviceToHost));

    // --- Vérification ---
    int errors = 0;
    for (int i = 0; i < n; ++i) {
        if (std::fabs(cCpu[i] - cGpu[i]) > 1e-5f) ++errors;
    }

    std::printf("Éléments          : %d\n", n);
    std::printf("Temps CPU         : %.2f ms\n", cpuMs);
    std::printf("Temps GPU (kernel): %.2f ms\n", gpuMs);
    std::printf("Accélération      : x%.1f\n", cpuMs / gpuMs);
    std::printf("Résultat          : %s\n", errors == 0 ? "OK" : "ERREURS");

    CUDA_CHECK(cudaEventDestroy(start));
    CUDA_CHECK(cudaEventDestroy(stop));
    CUDA_CHECK(cudaFree(dA));
    CUDA_CHECK(cudaFree(dB));
    CUDA_CHECK(cudaFree(dC));
    return errors == 0 ? EXIT_SUCCESS : EXIT_FAILURE;
}
