"use strict";
const { Cap, decoders } = require('cap');
const { PROTOCOL } = decoders;
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const c = new Cap();
const deviceList = Cap.deviceList();

console.log('Available devices:');
deviceList.forEach((device, index) => {
  console.log(`${index}: ${device.name} - ${device.description}`);
});

rl.question('Ingrese el número del dispositivo: ', (dVS) => {
  console.log(`Seleccionado: ${dVS}!`);
  const device = deviceList[parseInt(dVS)].name;
  const filter = 'tcp';
  const bufSize = 10 * 1024 * 1024;
  const buffer = Buffer.alloc(65535);

  const flowMap = new Map();

  c.open(device, filter, bufSize, buffer, true);
  console.log('Listening on ' + device);
  c.setMinBytes && c.setMinBytes(0);

  c.on('packet', (nbytes, trunc) => {
    const [seconds, nanoseconds] = process.hrtime();
    const timestamp = (seconds * 1e3) + (nanoseconds / 1e6);

    const ret = decoders.Ethernet(buffer);
    let vlanId = undefined;

    // Verificar si el paquete tiene un encabezado 802.1Q (VLAN tagging)
    if (ret.info.type === PROTOCOL.ETHERNET.VLAN) {
      const vlan = decoders.VLAN(buffer, ret.offset);
      vlanId = vlan.info.id;
      ret.offset += 4; // Ajustar el offset para el siguiente encabezado
    }

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
            tcpControlBits_Rev: undefined,
          });
        }

        const flowData = flowMap.get(flowKey);
        const revFlowData = flowMap.get(revFlowKey);

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
        const flowEndMilliseconds = (endSec * 1e3) + (endNano / 1e6);
        const [endRevSec, endRevNano] = process.hrtime();
        const flowEndMilliseconds_Rev = (endRevSec * 1e3) + (endRevNano / 1e6);
        const [startRevSec, startRevNano] = process.hrtime();
        const flowStartMilliseconds_Rev = (startRevSec * 1e3) + (startRevNano / 1e6);

        flowData.flowEndMilliseconds = flowEndMilliseconds;
        flowData.biFlowEndMilliseconds = flowEndMilliseconds;
        flowData.destinationIPv4Address = ip.info.dstaddr;
        flowData.destinationTransportPort = tcp.info.dstport;
        flowData.flowEndMilliseconds_Rev = flowEndMilliseconds_Rev;
        flowData.flowStartMilliseconds_Rev = flowStartMilliseconds_Rev;

        revFlowData.flowEndMilliseconds = flowEndMilliseconds;
        revFlowData.flowStartMilliseconds = timestamp;

        const packetData = {
          ...flowData,
          ...extractPacketData(ip, tcp, packetSize, flowData, revFlowData),
          timestamp: timestamp,
          ipClassOfService: ip.info.tos || 0,
        };

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
          timestamp: ${packetData.timestamp}
        `);

        flowMap.set(flowKey, flowData);
        flowMap.set(revFlowKey, revFlowData);
      }
    }
  });

  function extractPacketData(ip, tcp, packetSize, flowData, revFlowData) {
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
      timestamp: undefined
    };
  }

  rl.close();
});