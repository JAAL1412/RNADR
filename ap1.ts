import * as Cap from 'cap';
import { decoders, PROTOCOL } from 'cap';
import * as readline from 'readline';
import axios from 'axios';
 // Debería mostrar la estructura esperada

// Definir tipos para los datos del flujo
interface FlowData {
  biFlowStartMilliseconds: number;
  biFlowEndMilliseconds?: number;
  flowStartMilliseconds: number;
  flowStartMilliseconds_Rev?: number;
  flowEndMilliseconds?: number;
  flowEndMilliseconds_Rev?: number;
  octetDeltaCount: number;
  octetDeltaCount_Rev: number;
  packetDeltaCount: number;
  packetDeltaCount_Rev: number;
  tcpControlBits?: number;
  tcpControlBits_Rev?: number;
  tcpWindowSize?: number;
  destinationIPv4Address?: string;
  destinationTransportPort?: number;
  sourceIPv4Address?: string;
  sourceTransportPort?: number;
  timestamp?: number;
}

// Definir tipos para los datos del paquete
interface PacketData extends FlowData {
  ipClassOfService: number;
  protocolIdentifier: number;
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const c = new Cap();
const deviceList = Cap.deviceList();

console.log('Dispositivos disponibles: '); 
interface NetworkDevice {
    name: string;
    description: string;
  }
deviceList.forEach((device: NetworkDevice, index: number) => {
  console.log(`${index}: ${device.name} - ${device.description}`);
});

rl.question('Ingrese el número del dispositivo: ', (dVS: string) => {
  console.log(`Seleccionado: ${dVS}!`);
  const device = deviceList[parseInt(dVS)].name;
  const filter = 'tcp';
  const bufSize = 10 * 1024 * 1024;
  const buffer = Buffer.alloc(65535);

  const flowMap = new Map<string, FlowData>();

  c.open(device, filter, bufSize, buffer, true);
  console.log('Recibiendo del dispositivo: ' + device);
  c.setMinBytes && c.setMinBytes(0);

  c.on('packet', (nbytes: number, trunc: boolean) => {
    const [seconds, nanoseconds] = process.hrtime();
    const timestamp = seconds * 1e3 + nanoseconds / 1e6;

    const ret = decoders.Ethernet(buffer);


    if (ret.info.type === PROTOCOL.ETHERNET.IPV4) {
      const ip = decoders.IPV4(buffer, ret.offset);
      if (ip.info.protocol === PROTOCOL.IP.TCP) {
        const tcp = decoders.TCP(buffer, ip.offset);
        const packetSize = nbytes - ret.offset;
        const flowKey = `${ip.info.srcaddr}:${tcp.info.srcport}-${ip.info.dstaddr}:${tcp.info.dstport}`;
        const revFlowKey = `${ip.info.dstaddr}:${tcp.info.dstport}-${ip.info.srcaddr}:${tcp.info.srcport}`;

        if (!flowMap.has(flowKey)) {
          flowMap.set(flowKey, {
            biFlowStartMilliseconds: timestamp,
            flowStartMilliseconds: timestamp,
            flowStartMilliseconds_Rev: undefined,
            flowEndMilliseconds: undefined,
            flowEndMilliseconds_Rev: undefined,
            octetDeltaCount: 0,
            octetDeltaCount_Rev: 0,
            packetDeltaCount: 0,
            packetDeltaCount_Rev: 0,
            tcpControlBits: undefined,
            tcpControlBits_Rev: undefined,
          });
        }

        if (!flowMap.has(revFlowKey)) {
          flowMap.set(revFlowKey, {
            biFlowStartMilliseconds: 0,
            flowStartMilliseconds: 0,
            flowStartMilliseconds_Rev: undefined,
            flowEndMilliseconds: undefined,
            flowEndMilliseconds_Rev: undefined,
            octetDeltaCount: 0,
            octetDeltaCount_Rev: 0,
            packetDeltaCount: 0,
            packetDeltaCount_Rev: 0,
            tcpControlBits: undefined,
            tcpControlBits_Rev: undefined,
          });
        }

        const flowData = flowMap.get(flowKey)!;
        const revFlowData = flowMap.get(revFlowKey)!;

        if (flowKey === `${ip.info.srcaddr}:${tcp.info.srcport}-${ip.info.dstaddr}:${tcp.info.dstport}`) {
          flowData.octetDeltaCount += packetSize;
          flowData.packetDeltaCount += 1;
          flowData.tcpControlBits = tcp.info.flags;
          flowData.tcpWindowSize = tcp.info.windowSize || 0;
        } else if (revFlowKey === `${ip.info.dstaddr}:${tcp.info.dstport}-${ip.info.srcaddr}:${tcp.info.srcport}`) {
          revFlowData.octetDeltaCount += packetSize;
          revFlowData.packetDeltaCount += 1;
          revFlowData.tcpControlBits = tcp.info.flags;
          revFlowData.tcpWindowSize = tcp.info.windowSize || 0;

          flowData.tcpControlBits_Rev = tcp.info.flags;
        }

        const [endSec, endNano] = process.hrtime();
        const flowEndMilliseconds = endSec * 1e3 + endNano / 1e6;
        const [endRevSec, endRevNano] = process.hrtime();
        const flowEndMilliseconds_Rev = endRevSec * 1e3 + endRevNano / 1e6;
        const [startRevSec, startRevNano] = process.hrtime();
        const flowStartMilliseconds_Rev = startRevSec * 1e3 + startRevNano / 1e6;

        flowData.flowEndMilliseconds = flowEndMilliseconds;
        flowData.biFlowEndMilliseconds = flowEndMilliseconds;
        flowData.destinationIPv4Address = ip.info.dstaddr;
        flowData.destinationTransportPort = tcp.info.dstport;
        flowData.flowEndMilliseconds_Rev = flowEndMilliseconds_Rev;
        flowData.flowStartMilliseconds_Rev = flowStartMilliseconds_Rev;

        revFlowData.flowEndMilliseconds = flowEndMilliseconds;
        revFlowData.flowStartMilliseconds = timestamp;

        const packetData: PacketData = {
          ...flowData,
          ...extractPacketData(ip, tcp, packetSize, flowData, revFlowData),
          timestamp: timestamp,
          ipClassOfService: ip.info.tos || 0,
          protocolIdentifier: ip.info.protocol,
        };

        // Enviar datos a la API de Flask
        enviarDatos(packetData);

        flowMap.set(flowKey, flowData);
        flowMap.set(revFlowKey, revFlowData);
      }
    }
  });

  function extractPacketData(
    ip: any,
    tcp: any,
    packetSize: number,
    flowData: FlowData,
    revFlowData: FlowData
  ): Partial<PacketData> {
    return {
      biFlowEndMilliseconds: flowData.biFlowEndMilliseconds,
      biFlowStartMilliseconds: flowData.biFlowStartMilliseconds,
      destinationIPv4Address: ip.info.dstaddr,
      destinationTransportPort: tcp.info.dstport,
      flowEndMilliseconds: flowData.flowEndMilliseconds,
      flowEndMilliseconds_Rev: flowData.flowEndMilliseconds_Rev,
      flowStartMilliseconds: flowData.flowStartMilliseconds,
      flowStartMilliseconds_Rev: flowData.flowStartMilliseconds_Rev,
      ipClassOfService: ip.info.tos || 0,
      octetDeltaCount: flowData.octetDeltaCount,
      octetDeltaCount_Rev: revFlowData.octetDeltaCount,
      packetDeltaCount: flowData.packetDeltaCount,
      packetDeltaCount_Rev: revFlowData.packetDeltaCount,
      protocolIdentifier: ip.info.protocol,
      sourceIPv4Address: ip.info.srcaddr,
      sourceTransportPort: tcp.info.srcport,
      tcpControlBits: tcp.info.flags,
      tcpControlBits_Rev: revFlowData.tcpControlBits || 0,
      tcpWindowSize: tcp.info.windowSize || 0,
    };
  }

  // Función para enviar datos a la API de Flask
  async function enviarDatos(packetData: PacketData) {
    try {
      const response = await axios.post('http://localhost:5000/predecir', packetData);
      console.log('Predicción:', response.data.prediccion);
    } catch (error) {
      if (error instanceof Error) {
        console.error('Error al enviar datos:', error.message);
      } else {
        console.error('Error desconocido:', error);
      }
    }
  }

  rl.close();
});