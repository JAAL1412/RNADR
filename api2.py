from fastapi import FastAPI, Request, HTTPException
import torch
import torch.nn as nn
import torch.nn.functional as F
import numpy as np
from sklearn.preprocessing import LabelEncoder, StandardScaler
import pandas as pd

app = FastAPI()

class Net(nn.Module):
    def __init__(self, input_size, hidden_size, num_layers, output_size):
        super(Net, self).__init__()
        self.hidden_size = hidden_size
        self.num_layers = num_layers
        self.lstm = nn.LSTM(input_size, hidden_size, num_layers, batch_first=True)
        self.fc = nn.Linear(hidden_size, output_size)

    def forward(self, x):
        h0 = torch.zeros(self.num_layers, x.size(0), self.hidden_size).to(x.device)
        c0 = torch.zeros(self.num_layers, x.size(0), self.hidden_size).to(x.device)

        out, _ = self.lstm(x, (h0, c0))
        out = out[:, -1, :]
        out = self.fc(out)
        return out

hidden_size = 70  # Tamaño de la capa oculta
num_layers = 2  # Número de capas LSTM
output_size = 2  # Asumiendo que hay 2 clases: anómalo y no anómalo
input_size = 20  # Número de características de entrada (asegúrate de que coincida con tus datos)

@app.post("/")
async def predecir(request: Request):
    datos = await request.json()
    print(datos)

    campos_requeridos = [
        'biFlowEndMilliseconds', 'biFlowStartMilliseconds', 'destinationIPv4Address',
        'destinationTransportPort', 'flowEndMilliseconds', 'flowEndMilliseconds_Rev',
        'flowStartMilliseconds', 'flowStartMilliseconds_Rev', 'ipClassOfService', 
        'octetDeltaCount', 'octetDeltaCount_Rev', 'packetDeltaCount',
        'packetDeltaCount_Rev', 'protocolIdentifier', 'sourceIPv4Address',
        'sourceTransportPort', 'tcpControlBits', 'tcpControlBits_Rev', 'tcpWindowSize',
        'timestamp'
    ]

    for campo in campos_requeridos:
        if campo not in datos:
            raise HTTPException(status_code=400, detail=f"Falta el campo: {campo}")

    datos_entrada = pd.DataFrame([[
        datos['biFlowEndMilliseconds'], datos['biFlowStartMilliseconds'],
        datos['destinationIPv4Address'], datos['destinationTransportPort'],
        datos['flowEndMilliseconds'], datos['flowEndMilliseconds_Rev'],
        datos['flowStartMilliseconds'], datos['flowStartMilliseconds_Rev'],
        datos['ipClassOfService'], datos['octetDeltaCount'],
        datos['octetDeltaCount_Rev'], datos['packetDeltaCount'],
        datos['packetDeltaCount_Rev'], datos['protocolIdentifier'],
        datos['sourceIPv4Address'], datos['sourceTransportPort'],
        datos['tcpControlBits'], datos['tcpControlBits_Rev'],
        datos['tcpWindowSize'], datos['timestamp']
    ]], columns=[
        'biFlowEndMilliseconds', 'biFlowStartMilliseconds', 'destinationIPv4Address',
        'destinationTransportPort', 'flowEndMilliseconds', 'flowEndMilliseconds_Rev',
        'flowStartMilliseconds', 'flowStartMilliseconds_Rev', 'ipClassOfService', 
        'octetDeltaCount', 'octetDeltaCount_Rev', 'packetDeltaCount',
        'packetDeltaCount_Rev', 'protocolIdentifier', 'sourceIPv4Address',
        'sourceTransportPort', 'tcpControlBits', 'tcpControlBits_Rev',
        'tcpWindowSize', 'timestamp'
    ])

    label_encoder = LabelEncoder()
    datos_entrada['destinationIPv4Address'] = label_encoder.fit_transform(datos_entrada['destinationIPv4Address'].astype(str))
    datos_entrada['sourceIPv4Address'] = label_encoder.fit_transform(datos_entrada['sourceIPv4Address'].astype(str))

    for column in datos_entrada.columns:
        if datos_entrada[column].dtype == 'object':
            datos_entrada[column] = label_encoder.fit_transform(datos_entrada[column].astype(str))

    scaler = StandardScaler()
    datos_entrada_scaled = scaler.fit_transform(datos_entrada)

    tensor_entrada = torch.tensor(datos_entrada_scaled, dtype=torch.float32).unsqueeze(0)  # Añadir dimensión de batch

    # Usar el contexto safe_globals para cargar el modelo
    with torch.serialization.safe_globals([Net]):
        Anoma = Net(input_size, hidden_size, num_layers, output_size)
        Anoma.load_state_dict(torch.load('./anomastate(1).pth'))
        Anoma.eval()

    with torch.no_grad():
        prediccion = Anoma(tensor_entrada)

    # Aplicar softmax para obtener probabilidades
    probabilidades = F.softmax(prediccion, dim=1)
    prediccion_clase = torch.argmax(probabilidades, dim=1).item()

    return {'prediccion': prediccion_clase, 'probabilidades': probabilidades.tolist()}
