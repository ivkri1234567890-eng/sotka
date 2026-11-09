import UIKit
#if canImport(RoomPlan)
import RoomPlan

/// Automatic room scan with Apple RoomPlan (LiDAR iPhones, iOS 16+).
/// Each captured room becomes a floor polygon + height + doors/windows in the scanner's room format.
/// On iOS 17+ the AR session keeps running between rooms, so rooms share one coordinate frame (plan layout).
@available(iOS 16.0, *)
final class RoomPlanController: UIViewController, RoomCaptureViewDelegate {
    var onFinish: (([String: Any]?) -> Void)?
    private var capView: RoomCaptureView!
    private var rooms: [[String: Any]] = []
    private var frameIndex = 0
    private var scanning = false
    private var processing = false
    private let bar = UIStackView()
    private let info = UILabel()

    override var preferredStatusBarStyle: UIStatusBarStyle { .lightContent }

    init() { super.init(nibName: nil, bundle: nil) }
    required init?(coder: NSCoder) { fatalError("not used") }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black
        capView = RoomCaptureView(frame: view.bounds)
        capView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        capView.delegate = self
        view.addSubview(capView)
        info.textColor = .white
        info.numberOfLines = 0
        info.font = .systemFont(ofSize: 14)
        info.textAlignment = .center
        info.backgroundColor = UIColor.black.withAlphaComponent(0.5)
        info.layer.cornerRadius = 10
        info.clipsToBounds = true
        bar.axis = .horizontal
        bar.spacing = 8
        bar.distribution = .fillEqually
        for v in [info, bar] as [UIView] { v.translatesAutoresizingMaskIntoConstraints = false; view.addSubview(v) }
        let g = view.safeAreaLayoutGuide
        NSLayoutConstraint.activate([
            bar.leadingAnchor.constraint(equalTo: g.leadingAnchor, constant: 12), bar.trailingAnchor.constraint(equalTo: g.trailingAnchor, constant: -12),
            bar.bottomAnchor.constraint(equalTo: g.bottomAnchor, constant: -10), bar.heightAnchor.constraint(equalToConstant: 54),
            info.leadingAnchor.constraint(equalTo: g.leadingAnchor, constant: 12), info.trailingAnchor.constraint(equalTo: g.trailingAnchor, constant: -12),
            info.bottomAnchor.constraint(equalTo: bar.topAnchor, constant: -8),
        ])
        start()
    }

    override func viewWillDisappear(_ animated: Bool) {
        super.viewWillDisappear(animated)
        if scanning { capView.captureSession.stop() }
        UIApplication.shared.isIdleTimerDisabled = false
    }

    private func start() {
        UIApplication.shared.isIdleTimerDisabled = true
        capView.captureSession.run(configuration: RoomCaptureSession.Configuration())
        scanning = true
        updateUI()
    }

    private func stopRoom() {
        guard scanning else { return }
        scanning = false
        processing = true
        if #available(iOS 17.0, *) { capView.captureSession.stop(pauseARSession: false) } else { capView.captureSession.stop() }
        updateUI()
    }

    private func button(_ title: String, _ kind: String, _ sel: Selector) -> UIButton {
        let b = UIButton(type: .system)
        b.setTitle(title, for: .normal)
        b.titleLabel?.font = .systemFont(ofSize: 15, weight: .bold)
        b.titleLabel?.numberOfLines = 2
        b.titleLabel?.textAlignment = .center
        b.layer.cornerRadius = 12
        switch kind {
        case "ok": b.backgroundColor = UIColor(red: 0.30, green: 0.76, blue: 0.54, alpha: 1); b.setTitleColor(.black, for: .normal)
        case "": b.backgroundColor = AROverlayController.accent; b.setTitleColor(.black, for: .normal)
        default: b.backgroundColor = UIColor(white: 0.18, alpha: 0.95); b.setTitleColor(.white, for: .normal)
        }
        b.addTarget(self, action: sel, for: .touchUpInside)
        return b
    }

    private func updateUI() {
        bar.arrangedSubviews.forEach { $0.removeFromSuperview() }
        if scanning {
            info.text = " Помещение \(rooms.count + 1): медленно обведите камерой все стены, углы, двери и окна. "
            bar.addArrangedSubview(button("Отмена", "sec", #selector(cancel)))
            bar.addArrangedSubview(button("Комната готова", "", #selector(roomDone)))
        } else if processing {
            info.text = " Обработка… "
        } else {
            info.text = " Сохранено помещений: \(rooms.count). Можно отсканировать соседнее — не выключая сканер, пройдите в него. "
            bar.addArrangedSubview(button("Следующая комната", "sec", #selector(nextRoom)))
            bar.addArrangedSubview(button("Готово", "ok", #selector(finish)))
        }
    }

    @objc private func roomDone() { stopRoom() }
    @objc private func nextRoom() {
        if #available(iOS 17.0, *) {} else { frameIndex += 1 }   // iOS 16 restarts tracking: new coordinate frame
        start()
    }
    @objc private func cancel() {
        if scanning { scanning = false; capView.captureSession.stop() }
        onFinish?(rooms.isEmpty ? nil : ["rooms": rooms])
    }
    @objc private func finish() { onFinish?(rooms.isEmpty ? nil : ["rooms": rooms]) }

    // MARK: RoomCaptureViewDelegate

    func captureView(shouldPresent roomDataForProcessing: CapturedRoomData, error: Error?) -> Bool { true }

    func captureView(didPresent processedResult: CapturedRoom, error: Error?) {
        processing = false
        if let e = error { info.text = " Ошибка: \(e.localizedDescription) " }
        if let r = RoomPlanConvert.room(processedResult, name: "Помещение \(rooms.count + 1)", frame: frameIndex) { rooms.append(r) }
        else { flashInfo("Стены не распознаны — отсканируйте помещение ещё раз") }
        updateUI()
    }

    private func flashInfo(_ t: String) {
        let a = UIAlertController(title: nil, message: t, preferredStyle: .alert)
        a.addAction(UIAlertAction(title: "OK", style: .default))
        present(a, animated: true)
    }
}

@available(iOS 16.0, *)
enum RoomPlanConvert {
    static func xz(_ m: simd_float4x4, _ local: simd_float3) -> simd_float2 {
        let p = m * simd_float4(local, 1)
        return simd_float2(p.x, p.z)
    }

    static func room(_ r: CapturedRoom, name: String, frame: Int) -> [String: Any]? {
        let walls = r.walls
        guard walls.count >= 3 || floorPolygon(r) != nil else { return nil }
        let height = walls.map { $0.dimensions.y }.max() ?? 0
        var floorY = walls.map { $0.transform.columns.3.y - $0.dimensions.y / 2 }.min() ?? 0
        var poly = floorPolygon(r) ?? wallPolygon(walls)
        if #available(iOS 17.0, *), let f = r.floors.first { floorY = f.transform.columns.3.y }
        poly = cleanup(poly)
        guard poly.count >= 3 else { return nil }
        var ops: [[String: Any]] = []
        func add(_ s: CapturedRoom.Surface, _ type: String) {
            let c = s.transform.columns.3, w = s.dimensions.x, h = s.dimensions.y
            let center = simd_float2(c.x, c.z)
            var best = 0; var bd = Float.greatestFiniteMagnitude; var along: Float = 0
            for i in 0..<poly.count {
                let a = poly[i], b = poly[(i + 1) % poly.count], ab = b - a, L = max(simd_length(ab), 1e-6)
                let t = simd_dot(center - a, ab) / (L * L), tt = min(1, max(0, t))
                let d = simd_distance(center, a + ab * tt)
                if d < bd { bd = d; best = i; along = t * L }
            }
            let a = poly[best], b = poly[(best + 1) % poly.count], L = simd_distance(a, b)
            let ww = min(w, L)
            let bottom = max(0, c.y - h / 2 - floorY)
            var o: [String: Any] = ["type": type, "wall": best, "offset": Double(max(0, min(L - ww, along - ww / 2))), "w": Double(ww), "h": Double(h)]
            o["sill"] = type == "window" ? Double(bottom) : NSNull()
            ops.append(o)
        }
        r.doors.forEach { add($0, "door") }
        r.openings.forEach { add($0, "door") }
        r.windows.forEach { add($0, "window") }
        return [
            "name": name,
            "frame": frame,
            "corners": poly.map { [Double($0.x), Double($0.y)] },
            "h": height > 1 ? Double(height) : NSNull(),
            "ops": ops,
        ]
    }

    /// iOS 17: the floor surface carries its outline.
    static func floorPolygon(_ r: CapturedRoom) -> [simd_float2]? {
        if #available(iOS 17.0, *) {
            guard let f = r.floors.first, f.polygonCorners.count >= 3 else { return nil }
            return f.polygonCorners.map { xz(f.transform, $0) }
        }
        return nil
    }

    /// iOS 16: chain wall segments end to end; corners are the intersections of neighbouring wall lines.
    static func wallPolygon(_ walls: [CapturedRoom.Surface]) -> [simd_float2] {
        var segs = walls.map { w -> (simd_float2, simd_float2) in
            (xz(w.transform, simd_float3(-w.dimensions.x / 2, 0, 0)), xz(w.transform, simd_float3(w.dimensions.x / 2, 0, 0)))
        }
        guard !segs.isEmpty else { return [] }
        var chain = [segs.removeFirst()]
        while !segs.isEmpty {
            let end = chain.last!.1
            var bi = 0; var flip = false; var bd = Float.greatestFiniteMagnitude
            for (i, s) in segs.enumerated() {
                let d0 = simd_distance(end, s.0), d1 = simd_distance(end, s.1)
                if d0 < bd { bd = d0; bi = i; flip = false }
                if d1 < bd { bd = d1; bi = i; flip = true }
            }
            let s = segs.remove(at: bi)
            chain.append(flip ? (s.1, s.0) : s)
        }
        var pts: [simd_float2] = []
        let n = chain.count
        for i in 0..<n {
            let p = chain[(i + n - 1) % n], q = chain[i]
            pts.append(intersect(p.0, p.1, q.0, q.1) ?? (p.1 + q.0) / 2)
        }
        return pts
    }

    static func intersect(_ a: simd_float2, _ b: simd_float2, _ c: simd_float2, _ d: simd_float2) -> simd_float2? {
        let r = b - a, s = d - c, den = r.x * s.y - r.y * s.x
        if abs(den) < 1e-4 { return nil }
        let t = ((c.x - a.x) * s.y - (c.y - a.y) * s.x) / den
        let p = a + r * t
        // reject far-away intersections of almost parallel walls
        return simd_distance(p, b) < 1.0 ? p : nil
    }

    /// Drops near-duplicate points and nearly straight vertices.
    static func cleanup(_ input: [simd_float2]) -> [simd_float2] {
        var p = input
        var changed = true
        while changed && p.count > 3 {
            changed = false
            for i in 0..<p.count {
                let a = p[(i + p.count - 1) % p.count], b = p[i], c = p[(i + 1) % p.count]
                let u = b - a, v = c - b
                let lu = simd_length(u), lv = simd_length(v)
                let straight = lu > 1e-4 && lv > 1e-4 && abs(u.x * v.y - u.y * v.x) / (lu * lv) < 0.035 && simd_dot(u, v) > 0
                if lu < 0.03 || straight { p.remove(at: i); changed = true; break }
            }
        }
        return p
    }
}
#endif
