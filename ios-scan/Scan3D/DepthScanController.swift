import UIKit
import simd
import ARKit
import SceneKit

/// Object scan with the LiDAR depth map: unprojects high-confidence depth pixels into world points (1 cm voxels).
final class DepthScanController: AROverlayController, ARSessionDelegate {
    var onFinish: (([String: Any]?) -> Void)?
    private let sceneView = ARSCNView()
    private let cloudNode = SCNNode()
    private var pts: [Float] = []
    private var vox = Set<Int64>()
    private var recording = false
    private var frameN = 0
    private var lastDraw: TimeInterval = 0
    private var floorY: Float?
    private let maxPoints = 300_000

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black
        sceneView.frame = view.bounds
        sceneView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        view.addSubview(sceneView)
        sceneView.scene.rootNode.addChildNode(cloudNode)
        buildOverlay(crosshairVisible: false)
        doneButton.addTarget(self, action: #selector(done), for: .touchUpInside)
        valLabel.text = "0 точек"
        updateUI()
    }

    override func viewWillAppear(_ animated: Bool) {
        super.viewWillAppear(animated)
        let cfg = ARWorldTrackingConfiguration()
        cfg.planeDetection = [.horizontal]
        if ARWorldTrackingConfiguration.supportsFrameSemantics(.sceneDepth) { cfg.frameSemantics.insert(.sceneDepth) }
        sceneView.session.delegate = self
        sceneView.session.run(cfg)
        UIApplication.shared.isIdleTimerDisabled = true
    }

    override func viewWillDisappear(_ animated: Bool) {
        super.viewWillDisappear(animated)
        sceneView.session.pause()
        UIApplication.shared.isIdleTimerDisabled = false
    }

    private func updateUI() {
        hintLabel.text = recording ? "Медленно обходите предмет, держите его в кадре на расстоянии 0,5–2 м" : "Отойдите на 1–2 м от предмета и нажмите «Запись»"
        infoLabel.text = floorY == nil ? "Захватите в кадр немного пола — по нему считается высота предмета" : "Пол найден"
        setButtons([(recording ? "stop" : "rec", recording ? "Пауза" : "Запись", recording ? "sec" : ""), ("clear", "Сначала", "sec")]) { [weak self] id in
            guard let self = self else { return }
            switch id {
            case "rec": self.recording = true
            case "stop": self.recording = false
            case "clear": self.pts.removeAll(); self.vox.removeAll(); self.redraw()
            default: break
            }
            self.updateUI()
        }
    }

    func session(_ session: ARSession, didUpdate frame: ARFrame) {
        frameN += 1
        // floor = lowest horizontal plane at least 0.5 m below the camera
        if frameN % 15 == 0 {
            let camY = frame.camera.transform.columns.3.y
            var best: Float?
            for case let p as ARPlaneAnchor in frame.anchors where p.alignment == .horizontal {
                let y = p.transform.columns.3.y
                if y < camY - 0.5, best == nil || y < best! { best = y }
            }
            if let b = best, floorY == nil || abs(b - floorY!) > 0.005 {
                let first = floorY == nil
                floorY = b
                if first { updateUI() }
            }
        }
        guard recording, frameN % 3 == 0, pts.count / 3 < maxPoints, let depth = frame.sceneDepth else { return }
        let dm = depth.depthMap
        CVPixelBufferLockBaseAddress(dm, .readOnly)
        defer { CVPixelBufferUnlockBaseAddress(dm, .readOnly) }
        var confBase: UnsafeMutableRawPointer?
        var confRow = 0
        if let cm = depth.confidenceMap {
            CVPixelBufferLockBaseAddress(cm, .readOnly)
            confBase = CVPixelBufferGetBaseAddress(cm)
            confRow = CVPixelBufferGetBytesPerRow(cm)
        }
        defer { if let cm = depth.confidenceMap { CVPixelBufferUnlockBaseAddress(cm, .readOnly) } }
        guard let base = CVPixelBufferGetBaseAddress(dm) else { return }
        let w = CVPixelBufferGetWidth(dm), h = CVPixelBufferGetHeight(dm), row = CVPixelBufferGetBytesPerRow(dm)
        let K = frame.camera.intrinsics, img = frame.camera.imageResolution
        let sx = Float(img.width) / Float(w), sy = Float(img.height) / Float(h)
        let fx = K[0][0], fy = K[1][1], cx = K[2][0], cy = K[2][1]
        let T = frame.camera.transform
        for v in stride(from: 1, to: h, by: 3) {
            let drow = base.advanced(by: v * row).assumingMemoryBound(to: Float32.self)
            let crow = confBase?.advanced(by: v * confRow).assumingMemoryBound(to: UInt8.self)
            for u in stride(from: 1, to: w, by: 3) {
                if let c = crow, c[u] < 2 { continue }   // only high confidence
                let d = drow[u]
                if !(d > 0.15 && d < 3.0) { continue }
                let x = (Float(u) * sx - cx) * d / fx
                let y = (Float(v) * sy - cy) * d / fy
                let wp = T * simd_float4(x, -y, -d, 1)
                let xi = Int64((wp.x * 100).rounded()) & 0x1FFFFF, yi = Int64((wp.y * 100).rounded()) & 0x1FFFFF, zi = Int64((wp.z * 100).rounded()) & 0x1FFFFF
                let key = (xi << 42) | (yi << 21) | zi
                if vox.insert(key).inserted {
                    pts.append(wp.x); pts.append(wp.y); pts.append(wp.z)
                }
            }
        }
        let now = Date().timeIntervalSince1970
        if now - lastDraw > 0.5 { lastDraw = now; redraw() }
    }

    private func redraw() {
        let n = pts.count / 3
        valLabel.text = NumberFormatter.localizedString(from: NSNumber(value: n), number: .decimal) + " точек"
        guard n > 0 else { cloudNode.geometry = nil; return }
        let data = pts.withUnsafeBufferPointer { Data(buffer: $0) }
        let src = SCNGeometrySource(data: data, semantic: .vertex, vectorCount: n, usesFloatComponents: true,
                                    componentsPerVector: 3, bytesPerComponent: 4, dataOffset: 0, dataStride: 12)
        let idx = (0..<Int32(n)).map { $0 }
        let el = SCNGeometryElement(indices: idx, primitiveType: .point)
        el.pointSize = 3
        el.minimumPointScreenSpaceRadius = 1.5
        el.maximumPointScreenSpaceRadius = 4
        let g = SCNGeometry(sources: [src], elements: [el])
        g.firstMaterial?.diffuse.contents = UIColor(red: 0.30, green: 0.76, blue: 0.54, alpha: 1)
        g.firstMaterial?.lightingModel = .constant
        cloudNode.geometry = g
    }

    @objc private func done() {
        recording = false
        if pts.isEmpty { onFinish?(nil); return }
        let data = pts.withUnsafeBufferPointer { Data(buffer: $0) }
        var r: [String: Any] = ["points": data.base64EncodedString()]
        r["floorY"] = floorY.map { Double($0) } ?? NSNull()
        onFinish?(r)
    }
}
