# -*- coding: utf-8 -*-
"""Prueba.ipynb

Automatically generated by Colab.

Original file is located at
    https://colab.research.google.com/drive/1bkHhCNzaLL2TmjjZpbslgim2gkJuORZ7
"""

import torch
import pandas as pd
from sklearn.preprocessing import StandardScaler, LabelEncoder, OneHotEncoder #permite escalar los datos para usarse en las redes
from torch.utils.data import DataLoader, TensorDataset
import torch.nn as nn
import random
import time
import numpy as np

from google.colab import drive
drive.mount('/content/drive')

data = pd.read_csv('./tr1.csv', quoting=3, on_bad_lines='skip', low_memory=False)
data['label'] = data['label'].fillna(0)
# Selecciona las columnas relevantes
columns_to_keep = [
    'biFlowEndMilliseconds',
    'biFlowStartMilliseconds',
    'destinationIPv4Address',
    'destinationTransportPort',
    'flowEndMilliseconds',
    'flowEndMilliseconds_Rev',
    'flowStartMilliseconds',
    'flowStartMilliseconds_Rev',
    'ipClassOfService',
    'ipVersion',
    'octetDeltaCount',
    'octetDeltaCount_Rev',
    'packetDeltaCount',
    'packetDeltaCount_Rev',
    'protocolIdentifier',
    'sourceIPv4Address',
    'sourceTransportPort',
    'tcpControlBits',
    'tcpControlBits_Rev',
    'tcpWindowSize',
    'timestamp',
    'vlanId'
]

# Filtra las columnas seleccionadas
features = data.loc[:, columns_to_keep]
labels = data['label']
features = features.dropna()
labels = labels[features.index]

# Codificar las columnas de direcciones IP
label_encoder = LabelEncoder()
features['destinationIPv4Address'] = label_encoder.fit_transform(features['destinationIPv4Address'].astype(str))
features['sourceIPv4Address'] = label_encoder.fit_transform(features['sourceIPv4Address'].astype(str))

# Verificar y convertir cualquier columna restante que tenga valores no numéricos
for column in features.columns:
    if features[column].dtype == 'object':
        features[column] = label_encoder.fit_transform(features[column].astype(str))

# Normaliza los datos numéricos
scaler = StandardScaler()
features_scaled = scaler.fit_transform(features)

x = torch.tensor(features_scaled, dtype=torch.float32)
y = torch.tensor(labels.values, dtype=torch.float32)
test_dataset = TensorDataset(x, y)
test_loader = DataLoader(test_dataset, batch_size=32, shuffle=False)

class Net(nn.Module):
    def __init__(self, input_size, hidden_size, num_layers, output_size):
        super(Net, self).__init__()
        self.lstm = nn.LSTM(input_size, hidden_size, num_layers, batch_first=True)
        self.fc = nn.Linear(hidden_size, output_size)

    def forward(self, x):
        # LSTM forward pass
        h0 = torch.zeros(num_layers, x.size(0), hidden_size).to(x.device)
        c0 = torch.zeros(num_layers, x.size(0), hidden_size).to(x.device)

        out, _ = self.lstm(x, (h0, c0))

        # Solo tomamos la salida del último tiempo
        out = out[:, -1, :]
        out = self.fc(out)
        return out

input_size = features.shape[1]  # Número de características de entrada
hidden_size = 70  # Tamaño de la capa oculta
num_layers = 2  # Número de capas LSTM
output_size = 2  # Asumiendo que hay 2 clases: anómalo y no anómalo

Anoma= torch.load('./anoma.pth')
Anoma.eval()

# Seleccionar un índice aleatorio del conjunto de prueba
random_index = random.randint(0, len(test_loader.dataset) - 1)

# Evaluar el modelo en el conjunto de prueba
perdida = 0.0
correct = 0
total = 0
times = []

with torch.no_grad():  # No calcular gradientes
    for i, (inputs, targets) in enumerate(test_loader):
        inputs = inputs.unsqueeze(1)

        # Medir el tiempo de respuesta del modelo
        inicio = time.time()
        outputs = Anoma(inputs)
        fin = time.time()
        times.append(fin - inicio)

        # Calcular precisión del conjunto de prueba
        _, predicted = torch.max(outputs, 1)
        correct += (predicted == targets).sum().item()
        total += targets.size(0)

        # Imprimir los datos y predicción para el índice aleatorio seleccionado
        if random_index >= i * len(inputs) and random_index < (i + 1) * len(inputs):
            local_index = random_index - i * len(inputs)
            resultado_real = "sin anomalía" if targets[local_index].item() == 0 else "con anomalía"
            prediccion = "sin anomalía" if predicted[local_index].item() == 0 else "con anomalía"
            print(f'Datos reales: {inputs[local_index].numpy()}')
            print(f'Etiqueta real: {resultado_real}')
            print(f'Predicción de la red: {prediccion}')

# Prueba de robustez (introducción de ruido)
noise_factor = 0.1
inputs_noisy = inputs + noise_factor * torch.randn(inputs.shape)
outputs_noisy = Anoma(inputs_noisy)
_, predicted_noisy = torch.max(outputs_noisy, 1)

# Imprimir resultados de la prueba de robustez
print(f'Predicción con entrada ruidosa: {predicted_noisy[random_index % len(inputs_noisy)].item()}')

# Resultados de las pruebas
test_accuracy = 100 * correct / total
avg_test_loss = perdida / len(test_loader)
avg_time = np.mean(times)

print(f'Pérdida en el conjunto de prueba: {avg_test_loss:.4f}')
print(f'Precisión en el conjunto de prueba: {test_accuracy:.2f}%')
print(f'Tiempo promedio de respuesta: {avg_time:.6f} segundos')
input()