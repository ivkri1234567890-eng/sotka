import UIKit
import simd
import ARKit
import SceneKit

/// Room scan by floor corners (any ARKit iPhone) and AR ruler.
/// Coordinates: ARKit world, metres, y up. Plan uses (x, z).
final class CornerScanController: AROverlayController, ARSCNViewDelegate {
    var onFinish: (([String: Any]?) -> Void)?
    private let isRuler: Bool
    private let sceneView = ARSCNView()
    private let reticle = SCNNode()
    private var preview: SCNNode?
    private var timer: Timer?

    private struct Hit { var p: simd_float3; var horiz: Bool }
    private var hit: Hit?

    // room state
    private var floorY: Float?
    private var rooms: [[String: Any]] = []
    private var corners: [simd_float2] = []
    private var nodes: [SCNNode] = []       // nodes of the current contour (for undo)
    private var ops: [[String: Any]] = []
    private var height: Float?
    private var step = "corners"
    private var opType = "door"
    private var opE1: simd_float2?
    private var opWall = 0
    private var opOffset: Float = 0
    private var opW: Float = 0
    private var opSill: Float?
    // ruler
    private var ruler: [simd_float3] = []
    private var rulerLog: [String] = []

    init(ruler: Bool) {
        isRuler = ruler
        super.init(nibName: nil, bundle: nil)
    }
    required init?(coder: NSCoder) { fatalError("not used") }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black
        sceneView.frame = view.bounds
        sceneView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        sceneView.delegate = self
        sceneView.automaticallyUpdatesLighting = true
        view.addSubview(sceneView)
        let ring = SCNTorus(ringRadius: 0.05, pipeRadius: 0.006)
        ring.firstMaterial?.diffuse.contents = AROverlayController.accent
        ring.firstMaterial?.lightingModel = .constant
        reticle.geometry = ring
        reticle.isHidden = true
        sceneView.scene.rootNode.addChildNode(reticle)
        buildOverlay()
        doneButton.addTarget(self, action: #selector(done), for: .touchUpInside)
        valLabel.text = "—"
        hintLabel.text = "Медленно ведите телефоном по полу, пока не появится кольцо"
        updateUI()
    }

    override func viewWillAppear(_ animated: Bool) {
        super.viewWillAppear(animated)
        let cfg = ARWorldTrackingConfiguration()
        cfg.planeDetection = [.horizontal, .vertical]
        if ARWorldTrackingConfiguration.supportsSceneReconstruction(.mesh) { cfg.sceneReconstruction = .mesh }
        sceneView.session.run(cfg)
        UIApplication.shared.isIdleTimerDisabled = true
        timer = Timer.scheduledTimer(withTimeInterval: 1.0 / 15.0, repeats: true) { [weak self] _ in self?.tick() }
    }

    override func viewWillDisappear(_ animated: Bool) {
        super.viewWillDisappear(animated)
        timer?.invalidate()
        sceneView.session.pause()
        UIApplication.shared.isIdleTimerDisabled = false
    }

    // MARK: raycast

    private func raycast() -> Hit? {
        let c = CGPoint(x: sceneView.bounds.midX, y: sceneView.bounds.midY)
        let floorStep = !isRuler && step == "corners"
        let tries: [(ARRaycastQuery.Target, ARRaycastQuery.TargetAlignment)] = floorStep
            ? [(.existingPlaneGeometry, .horizontal), (.estimatedPlane, .horizontal)]
            : [(.existingPlaneGeometry, .any), (.estimatedPlane, .any)]
        for (target, align) in tries {
            if let q = sceneView.raycastQuery(from: c, allowing: target, alignment: align),
               let r = sceneView.session.raycast(q).first {
                let t = r.worldTransform.columns.3
                var horiz = r.targetAlignment == .horizontal
                if let pa = r.anchor as? ARPlaneAnchor { horiz = pa.alignment == .horizontal }
                return Hit(p: simd_float3(t.x, t.y, t.z), horiz: horiz)
            }
        }
        return nil
    }

    private func tick() {
        hit = raycast()
        if let h = hit {
            reticle.isHidden = false
            reticle.simdPosition = h.p
            reticle.simdOrientation = h.horiz ? simd_quatf(angle: 0, axis: [0, 1, 0]) : simd_quatf(angle: .pi / 2, axis: [1, 0, 0])
        } else { reticle.isHidden = true }
        preview?.removeFromParentNode(); preview = nil
        guard let h = hit else { return }
        if isRuler {
            if let a = ruler.first { valLabel.text = fmtM(simd_distance(a, h.p)); preview = line(a, h.p, AROverlayController.accent, add: false) }
            if let p = preview { sceneView.scene.rootNode.addChildNode(p) }
            return
        }
        switch step {
        case "corners":
            if let a = corners.last, let fy = floorY {
                valLabel.text = fmtM(simd_distance(a, simd_float2(h.p.x, h.p.z)))
                preview = line(simd_float3(a.x, fy, a.y), simd_float3(h.p.x, fy, h.p.z), AROverlayController.accent, add: false)
            } else { valLabel.text = corners.isEmpty ? "Угол 1" : "—" }
        case "height":
            if let fy = floorY, h.p.y - fy > 0.5 { valLabel.text = fmtM(h.p.y - fy) } else { valLabel.text = "—" }
        case "opE2":
            if let e = opE1 { valLabel.text = fmtM(simd_distance(e, simd_float2(h.p.x, h.p.z))) }
        case "opTop", "opSill":
            if let fy = floorY { valLabel.text = fmtM(h.p.y - fy) }
        default: break
        }
        if let p = preview { sceneView.scene.rootNode.addChildNode(p) }
    }

    // MARK: scene helpers

    @discardableResult private func marker(_ p: simd_float3, _ color: UIColor) -> SCNNode {
        let s = SCNSphere(radius: 0.02)
        s.firstMaterial?.diffuse.contents = color
        s.firstMaterial?.lightingModel = .constant
        let n = SCNNode(geometry: s)
        n.simdPosition = p
        sceneView.scene.rootNode.addChildNode(n)
        return n
    }

    @discardableResult private func line(_ a: simd_float3, _ b: simd_float3, _ color: UIColor, add: Bool = true, radius: CGFloat = 0.004) -> SCNNode {
        let len = simd_distance(a, b)
        let c = SCNCylinder(radius: radius, height: CGFloat(max(len, 0.001)))
        c.firstMaterial?.diffuse.contents = color
        c.firstMaterial?.lightingModel = .constant
        let n = SCNNode(geometry: c)
        n.simdPosition = (a + b) / 2
        if len > 0.0001 { n.simdOrientation = simd_quatf(from: [0, 1, 0], to: simd_normalize(b - a)) }
        if add { sceneView.scene.rootNode.addChildNode(n) }
        return n
    }

    @discardableResult private func label(_ text: String, _ p: simd_float3) -> SCNNode {
        let t = SCNText(string: text, extrusionDepth: 0)
        t.font = UIFont.systemFont(ofSize: 10, weight: .bold)
        t.flatness = 0.2
        t.firstMaterial?.diffuse.contents = UIColor.white
        t.firstMaterial?.lightingModel = .constant
        t.firstMaterial?.readsFromDepthBuffer = false
        let n = SCNNode(geometry: t)
        let (mn, mx) = t.boundingBox
        n.pivot = SCNMatrix4MakeTranslation((mx.x - mn.x) / 2 + mn.x, mn.y, 0)
        n.scale = SCNVector3(0.004, 0.004, 0.004)
        n.simdPosition = p
        let bb = SCNBillboardConstraint()
        bb.freeAxes = .all
        n.constraints = [bb]
        n.renderingOrder = 10
        sceneView.scene.rootNode.addChildNode(n)
        return n
    }

    // MARK: UI

    private func updateUI() {
        if isRuler {
            hintLabel.text = ruler.isEmpty ? "Наведите кольцо на первую точку и нажмите «Точка»" : "Наведите на вторую точку"
            infoLabel.text = rulerLog.suffix(3).joined(separator: "\n")
            var b: [(String, String, String)] = [("rpt", "Точка", "")]
            if !ruler.isEmpty { b.append(("rclear", "Сброс", "sec")) }
            setButtons(b) { [weak self] in self?.act($0) }
            return
        }
        let rn = rooms.count + 1
        switch step {
        case "corners":
            hintLabel.text = corners.isEmpty ? "Наведите кольцо на угол комнаты у пола" : "Наведите кольцо на следующий угол у пола и нажмите «Угол»"
            infoLabel.text = "Помещение \(rn) · углов: \(corners.count)"
            var b: [(String, String, String)] = [("corner", "Угол", "")]
            if !corners.isEmpty { b.append(("undo", "Отменить", "sec")) }
            if corners.count >= 3 { b.append(("close", "Замкнуть", "ok")) }
            setButtons(b) { [weak self] in self?.act($0) }
        case "height":
            hintLabel.text = "Наведите кольцо на потолок или верх стены и нажмите «Высота»"
            infoLabel.text = "Помещение \(rn): \(corners.count) стен"
            setButtons([("height", "Высота", ""), ("skipH", "Пропустить", "sec")]) { [weak self] in self?.act($0) }
        case "ops":
            valLabel.text = "Проёмы"
            hintLabel.text = "Добавьте двери и окна или переходите к следующей комнате"
            infoLabel.text = "Помещение \(rn): проёмов \(ops.count)"
            setButtons([("door", "Дверь", ""), ("window", "Окно", ""), ("next", "След. комната", "sec"), ("finish", "Готово", "ok")]) { [weak self] in self?.act($0) }
        case "opE1":
            hintLabel.text = "Наведите кольцо на один край проёма (у пола или на стене) и нажмите «Край»"
            setButtons([("e1", "Край", ""), ("opCancel", "Отмена", "sec")]) { [weak self] in self?.act($0) }
        case "opE2":
            hintLabel.text = "Теперь на другой край проёма"
            setButtons([("e2", "Край", ""), ("opCancel", "Отмена", "sec")]) { [weak self] in self?.act($0) }
        case "opSill":
            hintLabel.text = "Наведите на низ окна (подоконник) на стене"
            setButtons([("sill", "Низ окна", ""), ("skipSill", "Пропустить", "sec")]) { [weak self] in self?.act($0) }
        case "opTop":
            hintLabel.text = "Наведите на верх проёма на стене"
            setButtons([("top", "Верх", ""), ("skipTop", "Пропустить", "sec")]) { [weak self] in self?.act($0) }
        default: break
        }
    }

    private func needHit() -> Hit? {
        guard let h = hit else { flash("Кольцо не видно — медленно поведите телефоном"); return nil }
        return h
    }

    private func projOnSeg(_ p: simd_float2, _ a: simd_float2, _ b: simd_float2) -> (along: Float, d: Float) {
        let ab = b - a, L = max(simd_length(ab), 1e-6), t = simd_dot(p - a, ab) / (L * L)
        let tt = min(1, max(0, t))
        return (t * L, simd_distance(p, a + ab * tt))
    }

    private func area(_ c: [simd_float2]) -> Float {
        var s: Float = 0
        for i in 0..<c.count { let a = c[i], b = c[(i + 1) % c.count]; s += a.x * b.y - b.x * a.y }
        return abs(s / 2)
    }

    private func act(_ a: String) {
        switch a {
        case "corner":
            guard let h = needHit() else { return }
            if floorY == nil { if !h.horiz { flash("Наведите на пол"); return }; floorY = h.p.y }
            let fy = floorY!
            let p = simd_float2(h.p.x, h.p.z)
            if let last = corners.last, simd_distance(last, p) < 0.05 { flash("Слишком близко к предыдущему углу"); return }
            corners.append(p)
            nodes.append(marker(simd_float3(p.x, fy, p.y), AROverlayController.accent))
            if corners.count > 1 {
                let q = corners[corners.count - 2]
                nodes.append(line(simd_float3(q.x, fy, q.y), simd_float3(p.x, fy, p.y), .white))
                nodes.append(label(fmtM(simd_distance(q, p), 2), simd_float3((q.x + p.x) / 2, fy + 0.05, (q.y + p.y) / 2)))
            }
        case "undo":
            guard !corners.isEmpty else { break }
            corners.removeLast()
            let k = corners.isEmpty ? 1 : 3
            for _ in 0..<k where !nodes.isEmpty { nodes.removeLast().removeFromParentNode() }
            if corners.isEmpty && rooms.isEmpty { floorY = nil }
        case "close":
            guard let fy = floorY, let q = corners.last, let p = corners.first else { break }
            line(simd_float3(q.x, fy, q.y), simd_float3(p.x, fy, p.y), .white)
            label(fmtM(simd_distance(q, p), 2), simd_float3((q.x + p.x) / 2, fy + 0.05, (q.y + p.y) / 2))
            step = "height"
            flash("Контур замкнут: " + String(format: "%.2f", area(corners)).replacingOccurrences(of: ".", with: ",") + " м²")
        case "height":
            guard let h = needHit(), let fy = floorY else { return }
            let hh = h.p.y - fy
            if hh < 1.5 || hh > 8 { flash("Высота " + fmtM(hh, 2) + " — наведите точнее на потолок"); return }
            height = hh
            for i in 0..<corners.count {
                let a = corners[i], b = corners[(i + 1) % corners.count]
                line(simd_float3(a.x, fy + hh, a.y), simd_float3(b.x, fy + hh, b.y), UIColor.systemGreen)
                line(simd_float3(a.x, fy, a.y), simd_float3(a.x, fy + hh, a.y), UIColor.systemGreen)
            }
            step = "ops"
        case "skipH": step = "ops"
        case "door", "window": opType = a; opE1 = nil; opSill = nil; step = "opE1"
        case "e1":
            guard let h = needHit() else { return }
            opE1 = simd_float2(h.p.x, h.p.z); marker(h.p, .systemBlue); step = "opE2"
        case "e2":
            guard let h = needHit(), let e1 = opE1, corners.count >= 3 else { return }
            let e2 = simd_float2(h.p.x, h.p.z), mid = (e1 + e2) / 2
            var best = 0; var bd = Float.greatestFiniteMagnitude
            for i in 0..<corners.count {
                let d = projOnSeg(mid, corners[i], corners[(i + 1) % corners.count]).d
                if d < bd { bd = d; best = i }
            }
            let A = corners[best], B = corners[(best + 1) % corners.count]
            let q1 = projOnSeg(e1, A, B).along, q2 = projOnSeg(e2, A, B).along
            opWall = best; opOffset = max(0, min(q1, q2)); opW = abs(q1 - q2)
            if opW < 0.2 { flash("Ширина " + fmtM(opW, 2) + " — слишком узко, повторите"); step = "opE1"; break }
            marker(h.p, .systemBlue)
            step = opType == "window" ? "opSill" : "opTop"
            flash((opType == "window" ? "Окно" : "Дверь") + " на стене \(best + 1): " + fmtM(opW))
        case "sill":
            guard let h = needHit(), let fy = floorY else { return }
            opSill = max(0, h.p.y - fy); step = "opTop"
        case "skipSill": step = "opTop"
        case "top", "skipTop":
            var oh: Float?
            if a == "top" {
                guard let h = needHit(), let fy = floorY else { return }
                let top = h.p.y - fy
                oh = opType == "window" && opSill != nil ? top - opSill! : top
                if (oh ?? 0) <= 0.2 { flash("Верх ниже низа — повторите"); return }
            }
            var o: [String: Any] = ["type": opType, "wall": opWall, "offset": opOffset, "w": opW]
            o["h"] = oh.map { Double($0) } ?? NSNull()
            o["sill"] = opSill.map { Double($0) } ?? NSNull()
            ops.append(o)
            step = "ops"
        case "opCancel": step = "ops"
        case "next", "finish":
            saveCurrent()
            if a == "finish" { finish(); return }
            flash("Помещение сохранено. Сканируйте следующее")
        case "rpt":
            guard let h = needHit() else { return }
            ruler.append(h.p)
            marker(h.p, AROverlayController.accent)
            if ruler.count == 2 {
                let p = ruler[0], q = ruler[1], d = simd_distance(p, q)
                line(p, q, AROverlayController.accent)
                label(fmtM(d), (p + q) / 2 + simd_float3(0, 0.04, 0))
                rulerLog.append("Замер: " + fmtM(d))
                ruler = []
            }
        case "rclear": ruler = []
        default: break
        }
        updateUI()
    }

    private func saveCurrent() {
        if corners.count >= 3 {
            rooms.append([
                "name": "Помещение \(rooms.count + 1)",
                "frame": 0,
                "corners": corners.map { [Double($0.x), Double($0.y)] },
                "h": height.map { Double($0) } ?? NSNull(),
                "ops": ops,
            ])
        }
        corners = []; nodes = []; ops = []; height = nil; step = "corners"
    }

    @objc private func done() {
        if isRuler { onFinish?(nil); return }
        if step != "corners" || corners.count >= 3 { saveCurrent() }
        finish()
    }

    private func finish() {
        onFinish?(rooms.isEmpty ? nil : ["rooms": rooms])
    }
}
