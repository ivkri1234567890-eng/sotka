import UIKit
import simd
import WebKit
import ARKit
#if canImport(RoomPlan)
import RoomPlan
#endif

/// Hosts the scanner's web UI (lists, plan, 3D view, export) and opens native ARKit screens for scanning.
/// JS → native: webkit.messageHandlers.scan.postMessage({type:'start',mode} | {type:'share',name,mime,b64})
/// native → JS: window.__iosResult(mode, data|null)
final class ScanWebController: UIViewController, WKScriptMessageHandler, WKNavigationDelegate {
    private var web: WKWebView!

    override var preferredStatusBarStyle: UIStatusBarStyle { .lightContent }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor(red: 0.08, green: 0.09, blue: 0.10, alpha: 1)
        let ucc = WKUserContentController()
        ucc.add(self, name: "scan")
        ucc.addUserScript(WKUserScript(source: "window.__iosCaps=\(caps());", injectionTime: .atDocumentStart, forMainFrameOnly: true))
        let cfg = WKWebViewConfiguration()
        cfg.userContentController = ucc
        web = WKWebView(frame: .zero, configuration: cfg)
        web.isOpaque = false
        web.backgroundColor = view.backgroundColor
        web.navigationDelegate = self
        web.scrollView.contentInsetAdjustmentBehavior = .always
        web.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(web)
        NSLayoutConstraint.activate([
            web.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            web.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            web.topAnchor.constraint(equalTo: view.topAnchor),
            web.bottomAnchor.constraint(equalTo: view.bottomAnchor),
        ])
        if let index = Bundle.main.url(forResource: "index", withExtension: "html", subdirectory: "www") {
            web.loadFileURL(index, allowingReadAccessTo: index.deletingLastPathComponent())
        }
    }

    private func caps() -> String {
        let lidar = ARWorldTrackingConfiguration.supportsFrameSemantics(.sceneDepth)
        var roomplan = false
        #if canImport(RoomPlan)
        if #available(iOS 16.0, *) { roomplan = RoomCaptureSession.isSupported }
        #endif
        return "{\"lidar\":\(lidar),\"roomplan\":\(roomplan)}"
    }

    private func jsValue(_ obj: Any?) -> String {
        guard let obj = obj, JSONSerialization.isValidJSONObject([obj]),
              let d = try? JSONSerialization.data(withJSONObject: [obj]), let s = String(data: d, encoding: .utf8) else { return "null" }
        return String(s.dropFirst().dropLast())
    }

    private func deliver(_ mode: String, _ data: [String: Any]?) {
        dismiss(animated: true) {
            self.web.evaluateJavaScript("window.__iosResult&&window.__iosResult(\(self.jsValue(mode)),\(self.jsValue(data)))", completionHandler: nil)
        }
    }

    private func toast(_ t: String) {
        web.evaluateJavaScript("typeof toast==='function'&&toast(\(jsValue(t)),4000)", completionHandler: nil)
    }

    func userContentController(_ c: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let m = message.body as? [String: Any], let type = m["type"] as? String else { return }
        if type == "start" {
            let mode = m["mode"] as? String ?? "room"
            guard ARWorldTrackingConfiguration.isSupported else { toast("Этот iPhone не поддерживает ARKit"); return }
            var vc: UIViewController?
            switch mode {
            case "roomplan":
                #if canImport(RoomPlan)
                if #available(iOS 16.0, *), RoomCaptureSession.isSupported {
                    let r = RoomPlanController()
                    r.onFinish = { [weak self] d in self?.deliver(mode, d) }
                    vc = r
                }
                #endif
                if vc == nil { toast("Нужен iPhone с лидаром и iOS 16 — используйте «Помещения по углам»") ; return }
            case "obj":
                guard ARWorldTrackingConfiguration.supportsFrameSemantics(.sceneDepth) else { toast("Для скана предметов нужен iPhone с лидаром"); return }
                let d = DepthScanController()
                d.onFinish = { [weak self] r in self?.deliver(mode, r) }
                vc = d
            default:
                let a = CornerScanController(ruler: mode == "ruler")
                a.onFinish = { [weak self] r in self?.deliver(mode, r) }
                vc = a
            }
            if let vc = vc {
                vc.modalPresentationStyle = .fullScreen
                present(vc, animated: true)
            }
        } else if type == "share" {
            let bad = CharacterSet(charactersIn: "/\\:?*\"<>|")
            var name = (m["name"] as? String ?? "scan").components(separatedBy: bad).joined(separator: "-")
            if name.isEmpty { name = "scan" }
            guard let b64 = m["b64"] as? String, let data = Data(base64Encoded: b64) else { toast("Файл не создан"); return }
            // keep a copy in Files → On My iPhone → 3D Сканер
            let docs = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
            try? data.write(to: docs.appendingPathComponent(name))
            let url = FileManager.default.temporaryDirectory.appendingPathComponent(name)
            do { try data.write(to: url) } catch { toast("Не удалось подготовить файл"); return }
            let vc = UIActivityViewController(activityItems: [url], applicationActivities: nil)
            vc.popoverPresentationController?.sourceView = view
            vc.popoverPresentationController?.sourceRect = CGRect(x: view.bounds.midX, y: view.bounds.maxY - 80, width: 1, height: 1)
            present(vc, animated: true)
        }
    }

    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        if let url = action.request.url, ["http", "https", "tel", "mailto"].contains(url.scheme ?? "") {
            UIApplication.shared.open(url)
            decisionHandler(.cancel)
            return
        }
        decisionHandler(.allow)
    }
}

/// Shared overlay for the AR screens: value, hint, info and a row of buttons.
class AROverlayController: UIViewController {
    let valLabel = UILabel()
    let hintLabel = UILabel()
    let infoLabel = UILabel()
    let buttonStack = UIStackView()
    let doneButton = UIButton(type: .system)
    let crosshair = UIView()
    private var actions: [String: () -> Void] = [:]

    override var preferredStatusBarStyle: UIStatusBarStyle { .lightContent }
    static let accent = UIColor(red: 1.0, green: 0.54, blue: 0.24, alpha: 1)

    func buildOverlay(crosshairVisible: Bool = true) {
        let top = UIView(), bottom = UIView()
        top.backgroundColor = UIColor.black.withAlphaComponent(0.45)
        bottom.backgroundColor = UIColor.black.withAlphaComponent(0.55)
        for v in [top, bottom, crosshair] { v.translatesAutoresizingMaskIntoConstraints = false; view.addSubview(v) }
        valLabel.font = UIFont.monospacedDigitSystemFont(ofSize: 30, weight: .bold)
        hintLabel.font = .systemFont(ofSize: 15)
        infoLabel.font = .systemFont(ofSize: 14)
        for l in [valLabel, hintLabel, infoLabel] { l.textColor = .white; l.numberOfLines = 0; l.translatesAutoresizingMaskIntoConstraints = false }
        top.addSubview(valLabel); top.addSubview(hintLabel)
        doneButton.setTitle("Готово", for: .normal)
        style(doneButton, primary: false)
        doneButton.translatesAutoresizingMaskIntoConstraints = false
        top.addSubview(doneButton)
        buttonStack.axis = .horizontal
        buttonStack.spacing = 8
        buttonStack.distribution = .fillEqually
        buttonStack.translatesAutoresizingMaskIntoConstraints = false
        bottom.addSubview(infoLabel); bottom.addSubview(buttonStack)
        crosshair.layer.borderColor = UIColor.white.cgColor
        crosshair.layer.borderWidth = 2
        crosshair.layer.cornerRadius = 13
        crosshair.isUserInteractionEnabled = false
        crosshair.isHidden = !crosshairVisible
        let g = view.safeAreaLayoutGuide
        NSLayoutConstraint.activate([
            top.leadingAnchor.constraint(equalTo: view.leadingAnchor), top.trailingAnchor.constraint(equalTo: view.trailingAnchor), top.topAnchor.constraint(equalTo: view.topAnchor),
            valLabel.topAnchor.constraint(equalTo: g.topAnchor, constant: 8), valLabel.leadingAnchor.constraint(equalTo: g.leadingAnchor, constant: 14),
            valLabel.trailingAnchor.constraint(lessThanOrEqualTo: doneButton.leadingAnchor, constant: -8),
            doneButton.topAnchor.constraint(equalTo: g.topAnchor, constant: 8), doneButton.trailingAnchor.constraint(equalTo: g.trailingAnchor, constant: -12),
            doneButton.widthAnchor.constraint(greaterThanOrEqualToConstant: 96),
            hintLabel.topAnchor.constraint(equalTo: valLabel.bottomAnchor, constant: 4), hintLabel.leadingAnchor.constraint(equalTo: g.leadingAnchor, constant: 14),
            hintLabel.trailingAnchor.constraint(equalTo: g.trailingAnchor, constant: -14), hintLabel.bottomAnchor.constraint(equalTo: top.bottomAnchor, constant: -10),
            bottom.leadingAnchor.constraint(equalTo: view.leadingAnchor), bottom.trailingAnchor.constraint(equalTo: view.trailingAnchor), bottom.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            infoLabel.topAnchor.constraint(equalTo: bottom.topAnchor, constant: 10), infoLabel.leadingAnchor.constraint(equalTo: g.leadingAnchor, constant: 14), infoLabel.trailingAnchor.constraint(equalTo: g.trailingAnchor, constant: -14),
            buttonStack.topAnchor.constraint(equalTo: infoLabel.bottomAnchor, constant: 8), buttonStack.leadingAnchor.constraint(equalTo: g.leadingAnchor, constant: 12),
            buttonStack.trailingAnchor.constraint(equalTo: g.trailingAnchor, constant: -12), buttonStack.bottomAnchor.constraint(equalTo: g.bottomAnchor, constant: -10),
            buttonStack.heightAnchor.constraint(equalToConstant: 54),
            crosshair.centerXAnchor.constraint(equalTo: view.centerXAnchor), crosshair.centerYAnchor.constraint(equalTo: view.centerYAnchor),
            crosshair.widthAnchor.constraint(equalToConstant: 26), crosshair.heightAnchor.constraint(equalToConstant: 26),
        ])
    }

    func style(_ b: UIButton, primary: Bool, ok: Bool = false) {
        b.titleLabel?.font = .systemFont(ofSize: 15, weight: .bold)
        b.titleLabel?.adjustsFontSizeToFitWidth = true
        b.titleLabel?.minimumScaleFactor = 0.7
        b.titleLabel?.numberOfLines = 2
        b.titleLabel?.textAlignment = .center
        b.layer.cornerRadius = 12
        b.contentEdgeInsets = UIEdgeInsets(top: 8, left: 10, bottom: 8, right: 10)
        if ok { b.backgroundColor = UIColor(red: 0.30, green: 0.76, blue: 0.54, alpha: 1); b.setTitleColor(.black, for: .normal) }
        else if primary { b.backgroundColor = AROverlayController.accent; b.setTitleColor(.black, for: .normal) }
        else { b.backgroundColor = UIColor(white: 0.18, alpha: 0.95); b.setTitleColor(.white, for: .normal) }
    }

    /// buttons: (id, title, kind) where kind is "" (primary), "sec" or "ok"
    func setButtons(_ list: [(String, String, String)], _ handler: @escaping (String) -> Void) {
        buttonStack.arrangedSubviews.forEach { $0.removeFromSuperview() }
        actions = [:]
        for (id, title, kind) in list {
            let b = UIButton(type: .system)
            b.setTitle(title, for: .normal)
            style(b, primary: kind == "", ok: kind == "ok")
            b.accessibilityIdentifier = id
            b.addTarget(self, action: #selector(tapped(_:)), for: .touchUpInside)
            actions[id] = { handler(id) }
            buttonStack.addArrangedSubview(b)
        }
    }

    @objc private func tapped(_ b: UIButton) {
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
        if let id = b.accessibilityIdentifier { actions[id]?() }
    }

    func flash(_ text: String) {
        let l = PaddedLabel()
        l.text = text
        l.numberOfLines = 0
        l.textAlignment = .center
        l.font = .systemFont(ofSize: 14)
        l.backgroundColor = .white
        l.textColor = .black
        l.layer.cornerRadius = 10
        l.clipsToBounds = true
        l.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(l)
        NSLayoutConstraint.activate([
            l.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            l.centerYAnchor.constraint(equalTo: view.centerYAnchor, constant: 60),
            l.widthAnchor.constraint(lessThanOrEqualTo: view.widthAnchor, constant: -40),
        ])
        DispatchQueue.main.asyncAfter(deadline: .now() + 2.4) { l.removeFromSuperview() }
    }
}

final class PaddedLabel: UILabel {
    override func drawText(in rect: CGRect) { super.drawText(in: rect.insetBy(dx: 12, dy: 8)) }
    override var intrinsicContentSize: CGSize { let s = super.intrinsicContentSize; return CGSize(width: s.width + 24, height: s.height + 16) }
}

func fmtM(_ v: Float, _ d: Int = 3) -> String {
    let f = NumberFormatter()
    f.locale = Locale(identifier: "ru_RU")
    f.minimumFractionDigits = d
    f.maximumFractionDigits = d
    return (f.string(from: NSNumber(value: v)) ?? String(v)) + " м"
}
