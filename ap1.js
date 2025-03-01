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
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });

const cap = require("cap");
const Cap = cap.Cap; // Acceder a la clase Cap
const decoders = cap.decoders; // Acceder a los decoders
const PROTOCOL = decoders.PROTOCOL; // Acceder a PROTOCOL
const readline = require("readline");
const axios = require("axios");

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
});

const c = new Cap(); 
var deviceList = Cap.deviceList();
console.log('Dispositivos disponibles: ');
deviceList.forEach(function (device, index) {
    console.log("".concat(index, ": ").concat(device.name, " - ").concat(device.description));
});
rl.question('Ingrese el número del dispositivo: ', function (dVS) {
    console.log("Seleccionado: ".concat(dVS, "!"));
    var device = deviceList[parseInt(dVS)].name;
    var filter = 'tcp';
    var bufSize = 10 * 1024 * 1024;
    var buffer = Buffer.alloc(65535);
    var flowMap = new Map();
    c.open(device, filter, bufSize, buffer, true);
    console.log('Recibiendo del dispositivo: ' + device);
    c.setMinBytes && c.setMinBytes(0);
    c.on('packet', function (nbytes, trunc) {
        var _a = process.hrtime(), seconds = _a[0], nanoseconds = _a[1];
        var timestamp = seconds * 1e3 + nanoseconds / 1e6;
        var ret = decoders.Ethernet(buffer);
        if (ret.info.type === PROTOCOL.ETHERNET.IPV4) {
            var ip = decoders.IPV4(buffer, ret.offset);
            if (ip.info.protocol === PROTOCOL.IP.TCP) {
                var tcp = decoders.TCP(buffer, ip.offset);
                var packetSize = nbytes - ret.offset;
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
                var flowData = flowMap.get(flowKey);
                var revFlowData = flowMap.get(revFlowKey);
                if (flowKey === "".concat(ip.info.srcaddr, ":").concat(tcp.info.srcport, "-").concat(ip.info.dstaddr, ":").concat(tcp.info.dstport)) {
                    flowData.octetDeltaCount += packetSize;
                    flowData.packetDeltaCount += 1;
                    flowData.tcpControlBits = tcp.info.flags;
                    flowData.tcpWindowSize = tcp.info.windowSize || 0;
                }
                else if (revFlowKey === "".concat(ip.info.dstaddr, ":").concat(tcp.info.dstport, "-").concat(ip.info.srcaddr, ":").concat(tcp.info.srcport)) {
                    revFlowData.octetDeltaCount += packetSize;
                    revFlowData.packetDeltaCount += 1;
                    revFlowData.tcpControlBits = tcp.info.flags;
                    revFlowData.tcpWindowSize = tcp.info.windowSize || 0;
                    flowData.tcpControlBits_Rev = tcp.info.flags;
                }
                var _b = process.hrtime(), endSec = _b[0], endNano = _b[1];
                var flowEndMilliseconds = endSec * 1e3 + endNano / 1e6;
                var _c = process.hrtime(), endRevSec = _c[0], endRevNano = _c[1];
                var flowEndMilliseconds_Rev = endRevSec * 1e3 + endRevNano / 1e6;
                var _d = process.hrtime(), startRevSec = _d[0], startRevNano = _d[1];
                var flowStartMilliseconds_Rev = startRevSec * 1e3 + startRevNano / 1e6;
                flowData.flowEndMilliseconds = flowEndMilliseconds;
                flowData.biFlowEndMilliseconds = flowEndMilliseconds;
                flowData.destinationIPv4Address = ip.info.dstaddr;
                flowData.destinationTransportPort = tcp.info.dstport;
                flowData.flowEndMilliseconds_Rev = flowEndMilliseconds_Rev;
                flowData.flowStartMilliseconds_Rev = flowStartMilliseconds_Rev;
                revFlowData.flowEndMilliseconds = flowEndMilliseconds;
                revFlowData.flowStartMilliseconds = timestamp;
                var packetData = __assign(__assign(__assign({}, flowData), extractPacketData(ip, tcp, packetSize, flowData, revFlowData)), { timestamp: timestamp, ipClassOfService: ip.info.tos || 0, protocolIdentifier: ip.info.protocol });
                // Enviar datos a la API de Flask
                enviarDatos(packetData);
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
        };
    }
    // Función para enviar datos a la API de Flask
    async function enviarDatos(packetData) {
        try {
            // Imprimir los datos enviados
            //console.log('Datos enviados:', packetData);
    
            // Enviar solicitud POST a la API
            let response = await axios.post("http://127.0.0.1:8000/", packetData);
    
            // Imprimir la respuesta completa del servidor
           // console.log('Respuesta completa:', response);
    
            // Imprimir la predicción recibida de la API
            console.log('Predicción:', response.data.prediccion);
        } catch (error) {
            // Manejo de errores
            if (error instanceof Error) {
                console.error('Error al enviar datos:', error.message);
            } else {
                console.error('Error desconocido:', error);
            }
        }
    }
    
    rl.close();
}) 