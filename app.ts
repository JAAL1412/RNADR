import * as Cap from 'cap';
import { decoders, PROTOCOL } from 'cap';
import * as readline from 'readline';

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const c = new Cap();
const deviceList = Cap.deviceList();

console.log('Available devices:');
deviceList.forEach((device: any, index: number) => {
    console.log(`${index}: ${device.name} - ${device.description}`);
});

rl.question('Ingrese el número del dispositivo: ', (dVS: string) => {
    console.log(`Seleccionado: ${dVS}!`);
    const device = deviceList[parseInt(dVS)].name;

    const filter = 'tcp';
    const bufSize = 10 * 1024 * 1024;
    const buffer = Buffer.alloc(65535);

    // Define el tipo para los datos del flujo
    interface FlowData {
        biFlowStartMilliseconds: number | undefined;
        flowStartMilliseconds: number | undefined;
        flowStartMilliseconds_Rev: number | undefined;
        flowEndMilliseconds: number | undefined;
        flowEndMilliseconds_Rev: number | undefined;
        octetDeltaCount: number;
        octetDeltaCount_Rev: number;
        packetDeltaCount: number;
        packetDeltaCount_Rev: number;
        tcpControlBits: number | undefined;
        tcpControlBits_Rev: number | undefined;
        [key: string]: any; // Para permitir campos adicionales
    }

    // Mapa para almacenar información de los flujos
    const flowMap: Map<string, FlowData> = new Map();

    // Abrir en modo promiscuo
    c.open(device, filter, bufSize, buffer, true);
    console.log('Listening on ' + device);
    c.setMinBytes && c.setMinBytes(0);

    c.on('packet', function (nbytes: number, trunc: number) {
        const [seconds, nanoseconds] = process.hrtime();
        const timestamp = (seconds * 1e3) + (nanoseconds / 1e6); // Convertir a milisegundos con mayor precisión

        const ret = decoders.Ethernet(buffer);
        if (ret.info.type === PROTOCOL.ETHERNET.IPV4) {
            const ip = decoders.IPV4(buffer, ret.offset);
            if (ip.info.protocol === PROTOCOL.IP.TCP) {
                const tcp = decoders.TCP(buffer, ip.offset);
                const packetSize = nbytes - ret.offset; // Calcula el tamaño del paquete

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
                        tcpControlBits_Rev: undefined
                    });
                }

                if (!flowMap.has(revFlowKey)) {
                    flowMap.set(revFlowKey, {
                        biFlowStartMilliseconds: undefined,
                        flowStartMilliseconds: undefined,
                        flowStartMilliseconds_Rev: undefined,
                        flowEndMilliseconds: undefined,
                        flowEndMilliseconds_Rev: undefined,
                        octetDeltaCount: 0,
                        octetDeltaCount_Rev: 0,
                        packetDeltaCount: 0,
                        packetDeltaCount_Rev: 0,
                        tcpControlBits: undefined,
                        tcpControlBits_Rev: undefined
                    });
                }

                const flowData = flowMap.get(flowKey)!;
                const revFlowData = flowMap.get(revFlowKey)!;

                // Actualizar contadores para el flujo directo e inverso
                if (flowKey === `${ip.info.srcaddr}:${tcp.info.srcport}-${ip.info.dstaddr}:${tcp.info.dstport}`) {
                    // Paquete del flujo directo
                    flowData.octetDeltaCount += packetSize;
                    flowData.packetDeltaCount += 1;
                    flowData.tcpControlBits = tcp.info.flags;
                } else if (revFlowKey === `${ip.info.dstaddr}:${tcp.info.dstport}-${ip.info.srcaddr}:${tcp.info.srcport}`) {
                    // Paquete del flujo inverso
                    revFlowData.octetDeltaCount += packetSize;
                    revFlowData.packetDeltaCount += 1;
                    revFlowData.tcpControlBits = tcp.info.flags;
                    flowData.tcpControlBits_Rev = tcp.info.flags;
                }

                // Generar tiempos ligeramente diferentes para cada campo
                const [endSec, endNano] = process.hrtime();
                const flowEndMilliseconds = (endSec * 1e3) + (endNano / 1e6);
                const [endRevSec, endRevNano] = process.hrtime();
                const flowEndMilliseconds_Rev = (endRevSec * 1e3) + (endRevNano / 1e6);
                const [startRevSec, startRevNano] = process.hrtime();
                const flowStartMilliseconds_Rev = (startRevSec * 1e3) + (startRevNano / 1e6);

                // Actualizar tiempos del flujo
                flowData.flowEndMilliseconds = flowEndMilliseconds;
                flowData.biFlowEndMilliseconds = flowEndMilliseconds;
                flowData.destinationIPv4Address = ip.info.dstaddr;
                flowData.destinationTransportPort = tcp.info.dstport;
                flowData.flowEndMilliseconds_Rev = flowEndMilliseconds_Rev;
                flowData.flowStartMilliseconds_Rev = flowStartMilliseconds_Rev;

                // Actualizar tiempos del flujo inverso
                revFlowData.flowEndMilliseconds = flowEndMilliseconds;
                revFlowData.flowStartMilliseconds = timestamp;

                const packetData = {
                    ...flowData,
                    ...extractPacketData(ip, tcp, packetSize, flowData, revFlowData),
                    timestamp: timestamp
                };

                // Imprimir todos los campos del objeto packetData en la terminal
                console.log(`
                    biFlowEndMilliseconds: ${packetData.biFlowEndMilliseconds},
                    biFlowStartMilliseconds: ${packetData.biFlowStartMilliseconds},
                    destinationIPv4Address: ${packetData.destinationIPv4Address},
                    destinationTransportPort: ${packetData.destinationTransportPort},
                    flowEndMilliseconds: ${packetData.flowEndMilliseconds},
                    flowEndMilliseconds_Rev: ${packetData.flowEndMilliseconds_Rev},
                    flowStartMilliseconds: ${packetData.flowStartMilliseconds},
                    flowStartMilliseconds_Rev: ${packetData.flowStartMilliseconds_Rev},
                    ipClassOfService: ${packetData.ipClassOfService},
                    ipVersion: ${packetData.ipVersion},
                    octetDeltaCount: ${packetData.octetDeltaCount},
                    octetDeltaCount_Rev: ${packetData.octetDeltaCount_Rev},
                    packetDeltaCount: ${packetData.packetDeltaCount},
                    packetDeltaCount_Rev: ${packetData.packetDeltaCount_Rev},
                    protocolIdentifier: ${packetData.protocolIdentifier},
                    sourceIPv4Address: ${packetData.sourceIPv4Address},
                    sourceTransportPort: ${packetData.sourceTransportPort},
                    tcpControlBits: ${packetData.tcpControlBits},
                    tcpControlBits_Rev: ${packetData.tcpControlBits_Rev},
                    tcpWindowSize: ${packetData.tcpWindowSize},
                    vlanId: ${packetData.vlanId},
                    timestamp: ${packetData.timestamp}
                `);

                // Guardar el flujo actualizado
                flowMap.set(flowKey, flowData);
                flowMap.set(revFlowKey, revFlowData);
            }
        }
    });

    function extractPacketData(ip: any, tcp: any, packetSize: number, flowData: FlowData, revFlowData: FlowData): any {
        return {
            biFlowEndMilliseconds: flowData.biFlowEndMilliseconds,
            biFlowStartMilliseconds: flowData.biFlowStartMilliseconds,
            destinationIPv4Address: ip.info.dstaddr,
            destinationTransportPort: tcp.info.dstport,
            flowEndMilliseconds: flowData.flowEndMilliseconds,
            flowEndMilliseconds_Rev: flowData.flowEndMilliseconds_Rev,
            flowStartMilliseconds: flowData.flowStartMilliseconds,
            flowStartMilliseconds_Rev: flowData.flowStartMilliseconds_Rev,
            ipClassOfService: ip.info.tos,
            ipVersion: ip.info.version,
            octetDeltaCount: flowData.octetDeltaCount,
            octetDeltaCount_Rev: revFlowData.octetDeltaCount,
            packetDeltaCount: flowData.packetDeltaCount,
            packetDeltaCount_Rev: revFlowData.packetDeltaCount,
            protocolIdentifier: ip.info.protocol,
            sourceIPv4Address: ip.info.srcaddr,
            sourceTransportPort: tcp.info.srcport,
            tcpControlBits: tcp.info.flags,
            tcpControlBits_Rev: revFlowData.tcpControlBits_Rev,
            tcpWindowSize: tcp.info.windowSize,
            vlanId: undefined,
            timestamp: undefined
        };
    }

    rl.close();
});
