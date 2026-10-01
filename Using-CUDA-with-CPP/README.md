# Premier exemple CUDA

Addition de deux vecteurs de 50 millions de nombres, sur le CPU puis sur le GPU,
avec vérification du résultat et comparaison des temps.

Prévu pour une **NVIDIA Quadro RTX 3000** (architecture Turing, `sm_75`), mais il
fonctionne sur toute carte NVIDIA récente en adaptant l'option `-arch`.

## Prérequis

- Le pilote NVIDIA à jour (vérifier avec `nvidia-smi`).
- Le [CUDA Toolkit](https://developer.nvidia.com/cuda-downloads) (vérifier avec `nvcc --version`).
- Sous Windows : Visual Studio avec les outils C++ (nvcc s'en sert pour compiler),
  et lancer les commandes depuis « x64 Native Tools Command Prompt for VS ».

## Compiler et lancer

```bash
nvcc -O2 -arch=sm_75 vector_add.cu -o vector_add
./vector_add          # Windows : vector_add.exe
```

## Ce qu'il faut retenir

- `__global__` déclare un **kernel**, une fonction exécutée sur le GPU par des milliers de threads.
- `VectorAdd<<<blocs, threads>>>(...)` lance le kernel ; chaque thread calcule l'indice
  `blockIdx.x * blockDim.x + threadIdx.x` et traite un élément.
- La mémoire du GPU est séparée : `cudaMalloc` alloue, `cudaMemcpy` copie dans un sens ou dans l'autre.
- Les copies CPU ↔ GPU coûtent cher. Pour une opération aussi simple qu'une addition,
  elles prennent souvent plus de temps que le calcul lui-même : le GPU devient vraiment
  intéressant quand on fait beaucoup de calculs sur les mêmes données.
