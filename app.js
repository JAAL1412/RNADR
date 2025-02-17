"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
Object.defineProperty(exports, "__esModule", { value: true });
var Cap = require("cap");
var cap_1 = require("cap");
var readline = require("readline");
var rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});
var c = new Cap();
var deviceList = Cap.deviceList();
console.log('Available devices:');
deviceList.forEach(function (device, index) {
    console.log("".concat(index, ": ").concat(device.name, " - ").concat(device.description));
});
rl.question('Ingrese el número del dispositivo: ', function (dVS) {
    console.log("Seleccionado: ".concat(dVS, "!"));
    var device = deviceList[parseInt(dVS)].name;
    var filter = 'tcp';
    var bufSize = 10 * 1024 * 1024;
    var buffer = Buffer.alloc(65535);
    // Mapa para almacenar información de los flujos
    var flowMap = new Map();
    // Abrir en modo promiscuo
    c.open(device, filter, bufSize, buffer, true);
    console.log('Listening on ' + device);
    c.setMinBytes && c.setMinBytes(0);
    c.on('packet', function (nbytes, trunc) {
        var _a = process.hrtime(), seconds = _a[0], nanoseconds = _a[1];
        var timestamp = (seconds * 1e3) + (nanoseconds / 1e6); // Convertir a milisegundos con mayor precisión
        var ret = cap_1.decoders.Ethernet(buffer);
        if (ret.info.type === cap_1.PROTOCOL.ETHERNET.IPV4) {
            var ip = cap_1.decoders.IPV4(buffer, ret.offset);
            if (ip.info.protocol === cap_1.PROTOCOL.IP.TCP) {
                var tcp = cap_1.decoders.TCP(buffer, ip.offset);
                var packetSize = nbytes - ret.offset; // Calcula el tamaño del paquete
                var flowKey = "".concat(ip.info.srcaddr, ":").concat(tcp.info.srcport, "-").concat(ip.info.dstaddr, ":").concat(tcp.info.dstport);
                var revFlowKey = "".concat(ip.info.dstaddr, ":").concat(tcp.info.dstport, "-").concat(ip.info.srcaddr, ":").concat(tcp.info.srcport);
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
                var flowData = flowMap.get(flowKey);
                var revFlowData = flowMap.get(revFlowKey);
                // Actualizar contadores para el flujo directo e inverso
                if (flowKey === "".concat(ip.info.srcaddr, ":").concat(tcp.info.srcport, "-").concat(ip.info.dstaddr, ":").concat(tcp.info.dstport)) {
                    // Paquete del flujo directo
                    flowData.octetDeltaCount += packetSize;
                    flowData.packetDeltaCount += 1;
                    flowData.tcpControlBits = tcp.info.flags;
                }
                else if (revFlowKey === "".concat(ip.info.dstaddr, ":").concat(tcp.info.dstport, "-").concat(ip.info.srcaddr, ":").concat(tcp.info.srcport)) {
                    // Paquete del flujo inverso
                    revFlowData.octetDeltaCount += packetSize;
                    revFlowData.packetDeltaCount += 1;
                    revFlowData.tcpControlBits = tcp.info.flags;
                    flowData.tcpControlBits_Rev = tcp.info.flags;
                }
                // Generar tiempos ligeramente diferentes para cada campo
                var _b = process.hrtime(), endSec = _b[0], endNano = _b[1];
                var flowEndMilliseconds = (endSec * 1e3) + (endNano / 1e6);
                var _c = process.hrtime(), endRevSec = _c[0], endRevNano = _c[1];
                var flowEndMilliseconds_Rev = (endRevSec * 1e3) + (endRevNano / 1e6);
                var _d = process.hrtime(), startRevSec = _d[0], startRevNano = _d[1];
                var flowStartMilliseconds_Rev = (startRevSec * 1e3) + (startRevNano / 1e6);
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
                var packetData = __assign(__assign(__assign({}, flowData), extractPacketData(ip, tcp, packetSize, flowData, revFlowData)), { timestamp: timestamp });
                // Imprimir todos los campos del objeto packetData en la terminal
                console.log("\n                    biFlowEndMilliseconds: ".concat(packetData.biFlowEndMilliseconds, ",\n                    biFlowStartMilliseconds: ").concat(packetData.biFlowStartMilliseconds, ",\n                    destinationIPv4Address: ").concat(packetData.destinationIPv4Address, ",\n                    destinationTransportPort: ").concat(packetData.destinationTransportPort, ",\n                    flowEndMilliseconds: ").concat(packetData.flowEndMilliseconds, ",\n                    flowEndMilliseconds_Rev: ").concat(packetData.flowEndMilliseconds_Rev, ",\n                    flowStartMilliseconds: ").concat(packetData.flowStartMilliseconds, ",\n                    flowStartMilliseconds_Rev: ").concat(packetData.flowStartMilliseconds_Rev, ",\n                    ipClassOfService: ").concat(packetData.ipClassOfService, ",\n                    ipVersion: ").concat(packetData.ipVersion, ",\n                    octetDeltaCount: ").concat(packetData.octetDeltaCount, ",\n                    octetDeltaCount_Rev: ").concat(packetData.octetDeltaCount_Rev, ",\n                    packetDeltaCount: ").concat(packetData.packetDeltaCount, ",\n                    packetDeltaCount_Rev: ").concat(packetData.packetDeltaCount_Rev, ",\n                    protocolIdentifier: ").concat(packetData.protocolIdentifier, ",\n                    sourceIPv4Address: ").concat(packetData.sourceIPv4Address, ",\n                    sourceTransportPort: ").concat(packetData.sourceTransportPort, ",\n                    tcpControlBits: ").concat(packetData.tcpControlBits, ",\n                    tcpControlBits_Rev: ").concat(packetData.tcpControlBits_Rev, ",\n                    tcpWindowSize: ").concat(packetData.tcpWindowSize, ",\n                    vlanId: ").concat(packetData.vlanId, ",\n                    timestamp: ").concat(packetData.timestamp, "\n                "));
                // Guardar el flujo actualizado
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
