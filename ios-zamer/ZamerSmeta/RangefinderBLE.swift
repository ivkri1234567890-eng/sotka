import CoreBluetooth
import Foundation

/// Same protocol as Android Glm: Bosch GLM/PLR, Leica DISTO, any other BLE device (all notify channels).
/// iPhone has no classic Bluetooth (SPP); keyboard-mode (HID) rangefinders work through the input field.
final class RangefinderBLE: NSObject, CBCentralManagerDelegate, CBPeripheralDelegate {
    static let SVC = CBUUID(string: "02a6c0d0-0451-4000-b000-fb3210111989")
    static let CHR = CBUUID(string: "02a6c0d1-0451-4000-b000-fb3210111989")
    static let LEICA_SVC = CBUUID(string: "3ab10100-f831-4395-b29d-570977d5bf94")
    static let LEICA_CMD = CBUUID(string: "3ab10109-f831-4395-b29d-570977d5bf94")
    static let AUTOSYNC: [UInt8] = [0xC0, 0x55, 0x02, 0x01, 0x00, 0x1A]
    static let MEASURE: [UInt8] = [0xC0, 0x56, 0x01, 0x00, 0x1E]
    static let SKIP: Set<String> = ["1800", "1801", "180A", "180F", "1812"]

    private let send: (String) -> Void
    private var central: CBCentralManager?
    private var found: [UUID: CBPeripheral] = [:]
    private var peripheral: CBPeripheral?
    private var writeChar: CBCharacteristic?
    private var cmdChar: CBCharacteristic?
    private var proto = ""
    private var name = ""
    private var pendingScan = false
    private var subscribed = 0
    private var waiting = 0

    init(send: @escaping (String) -> Void) { self.send = send }

    private func q(_ s: String) -> String {
        guard let d = try? JSONSerialization.data(withJSONObject: [s]), let a = String(data: d, encoding: .utf8) else { return "\"\"" }
        return String(a.dropFirst().dropLast())
    }
    private func status(_ state: String, _ text: String) {
        send("{\"type\":\"status\",\"state\":\(q(state)),\"text\":\(q(text)),\"name\":\(q(name)),\"proto\":\(q(proto))}")
    }
    private func info(_ text: String) { send("{\"type\":\"info\",\"text\":\(q(text))}") }
    private func log(_ text: String) { send("{\"type\":\"log\",\"text\":\(q(text))}") }

    private func guess(_ name: String?, _ uuids: [CBUUID]?) -> String {
        if let u = uuids { if u.contains(Self.SVC) { return "bosch" }; if u.contains(Self.LEICA_SVC) { return "leica" } }
        let n = (name ?? "").uppercased()
        if n.contains("GLM") || n.hasPrefix("BOSCH") || n.hasPrefix("PLR") || n.contains("ZAMO") { return "bosch" }
        if n.contains("DISTO") { return "leica" }
        return ""
    }

    func start() {
        stop()
        found.removeAll()
        if central == nil { central = CBCentralManager(delegate: self, queue: .main) }
        if central?.state == .poweredOn { scan() } else { pendingScan = true; status("connecting", "Включаю Bluetooth…") }
    }

    private func scan() {
        pendingScan = false
        status("connecting", "Ищу дальномеры и Bluetooth-устройства… Включите Bluetooth на приборе")
        central?.scanForPeripherals(withServices: nil, options: [CBCentralManagerScanOptionAllowDuplicatesKey: false])
        DispatchQueue.main.asyncAfter(deadline: .now() + 15) { [weak self] in
            guard let self = self, self.central?.isScanning == true else { return }
            self.central?.stopScan()
            if self.peripheral == nil { self.status("off", self.found.isEmpty ? "Устройства не найдены. Включите Bluetooth на дальномере и повторите" : "Поиск завершён. Выберите дальномер в списке «Найденные устройства»") }
        }
    }

    func stop() {
        central?.stopScan()
        if let p = peripheral { central?.cancelPeripheralConnection(p) }
        peripheral = nil; writeChar = nil; cmdChar = nil; proto = ""; subscribed = 0; waiting = 0
    }

    func connect(id: String, name n: String) {
        guard let uuid = UUID(uuidString: id) else { status("off", "Неверное устройство"); return }
        central?.stopScan()
        let p = found[uuid] ?? central?.retrievePeripherals(withIdentifiers: [uuid]).first
        guard let per = p else { status("off", "Устройство не найдено — нажмите «Подключить» и выберите его снова"); return }
        stop()
        name = n.isEmpty ? (per.name ?? "Устройство") : n
        peripheral = per
        per.delegate = self
        status("connecting", "Подключаюсь к \(name)…")
        central?.connect(per, options: nil)
    }

    func measure() {
        guard let p = peripheral else { status("off", "Дальномер не подключён"); return }
        if proto == "bosch", let c = writeChar { p.writeValue(Data(Self.MEASURE), for: c, type: .withResponse) }
        else if proto == "leica", let c = cmdChar { p.writeValue(Data("g".utf8), for: c, type: c.properties.contains(.write) ? .withResponse : .withoutResponse) }
        else { info("Этот прибор не поддерживает замер с телефона — нажмите кнопку замера на самом дальномере") }
    }

    // MARK: central
    func centralManagerDidUpdateState(_ c: CBCentralManager) {
        switch c.state {
        case .poweredOn: if pendingScan { scan() }
        case .unauthorized: status("off", "Разрешите Bluetooth: Настройки → Замер и смета → Bluetooth")
        case .poweredOff: status("off", "Включите Bluetooth на iPhone")
        default: break
        }
    }

    func centralManager(_ c: CBCentralManager, didDiscover p: CBPeripheral, advertisementData ad: [String: Any], rssi RSSI: NSNumber) {
        let n = (ad[CBAdvertisementDataLocalNameKey] as? String) ?? p.name
        let g = guess(n, ad[CBAdvertisementDataServiceUUIDsKey] as? [CBUUID])
        if n == nil && g.isEmpty { return }
        if found[p.identifier] != nil { return }
        found[p.identifier] = p
        let id = p.identifier.uuidString
        send("{\"type\":\"device\",\"addr\":\(q(id)),\"name\":\(q(n ?? id)),\"rssi\":\(RSSI.intValue),\"kind\":\"ble\",\"proto\":\(q(g)),\"bonded\":false}")
        let pref = UserDefaults.standard.string(forKey: "rf_pref") ?? ""
        if pref.contains(id) || (pref.isEmpty || pref == "{}") && (g == "bosch" || g == "leica") {
            log("найден \(n ?? id) — подключаюсь автоматически")
            connect(id: id, name: n ?? "")
        }
    }

    func centralManager(_ c: CBCentralManager, didConnect p: CBPeripheral) {
        log("соединение установлено")
        p.discoverServices(nil)
    }

    func centralManager(_ c: CBCentralManager, didFailToConnect p: CBPeripheral, error: Error?) {
        status("off", "Не удалось подключиться: \(error?.localizedDescription ?? "")")
    }

    func centralManager(_ c: CBCentralManager, didDisconnectPeripheral p: CBPeripheral, error: Error?) {
        if p == peripheral { peripheral = nil; writeChar = nil; cmdChar = nil; status("off", "Дальномер отключён"); proto = "" }
    }

    // MARK: peripheral
    func peripheral(_ p: CBPeripheral, didDiscoverServices error: Error?) {
        let services = p.services ?? []
        log("сервисы: " + services.map { $0.uuid.uuidString }.joined(separator: " "))
        if services.contains(where: { $0.uuid == Self.SVC }) { proto = "bosch" }
        else if services.contains(where: { $0.uuid == Self.LEICA_SVC }) { proto = "leica" }
        else { proto = "generic" }
        waiting = 0
        for s in services {
            if proto == "bosch" && s.uuid != Self.SVC { continue }
            if proto == "leica" && s.uuid != Self.LEICA_SVC { continue }
            if proto == "generic" && Self.SKIP.contains(s.uuid.uuidString.uppercased()) { continue }
            waiting += 1
            p.discoverCharacteristics(nil, for: s)
        }
        if waiting == 0 { finish(p, hid: services.contains { $0.uuid.uuidString.uppercased() == "1812" }) }
    }

    func peripheral(_ p: CBPeripheral, didDiscoverCharacteristicsFor s: CBService, error: Error?) {
        for c in s.characteristics ?? [] {
            if c.uuid == Self.CHR { writeChar = c }
            if c.uuid == Self.LEICA_CMD { cmdChar = c }
            if c.properties.contains(.notify) || c.properties.contains(.indicate) {
                p.setNotifyValue(true, for: c); subscribed += 1
                log("канал данных: \(c.uuid.uuidString)")
            }
        }
        waiting -= 1
        if waiting <= 0 { finish(p, hid: false) }
    }

    private func finish(_ p: CBPeripheral, hid: Bool) {
        if proto == "bosch", let c = writeChar {
            p.writeValue(Data(Self.AUTOSYNC), for: c, type: .withResponse)
            status("on", "Дальномер подключён — нажимайте кнопку замера на GLM")
        } else if proto == "leica" {
            status("on", "Leica DISTO подключён — нажимайте кнопку замера на приборе")
        } else if subscribed == 0 {
            status("off", hid ? "\(name) работает как клавиатура. Подключите его в Настройках iPhone → Bluetooth и вводите замеры через поле «Ввод с клавиатуры»" : "У \(name) нет каналов передачи данных. Попробуйте режим клавиатуры")
        } else {
            status("on", "Подключено: \(name). Сделайте замер на приборе. Если число не распознано — используйте «Обучение» в настройках")
        }
    }

    func peripheral(_ p: CBPeripheral, didUpdateValueFor c: CBCharacteristic, error: Error?) {
        guard let v = c.value, !v.isEmpty else { return }
        let hex = v.map { String(format: "%02x", $0) }.joined()
        send("{\"type\":\"frame\",\"hex\":\"\(hex)\",\"proto\":\(q(proto)),\"chr\":\(q(c.uuid.uuidString.lowercased())),\"name\":\(q(name))}")
    }
}
