import UIKit
import WebKit

/// Hosts the same web app as Android and provides the same bridge objects:
/// window.Native (data, PDF, rangefinder), window.Ble2 (device choice), window.Files (DXF, IFC, CSV, JSON).
/// WKWebView has no synchronous bridge, so Native.load() and Ble2.preferred() read values injected at start.
final class WebViewController: UIViewController, WKScriptMessageHandler, WKNavigationDelegate {
    private var web: WKWebView!
    private lazy var ble = RangefinderBLE { [weak self] json in self?.emit(json) }
    private let docs = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
    private var dbURL: URL { docs.appendingPathComponent(".zamer-db.json") }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor(red: 0.95, green: 0.94, blue: 0.92, alpha: 1)
        let ucc = WKUserContentController()
        ucc.add(self, name: "native")
        ucc.addUserScript(WKUserScript(source: startScript(), injectionTime: .atDocumentStart, forMainFrameOnly: true))
        let cfg = WKWebViewConfiguration()
        cfg.userContentController = ucc
        web = WKWebView(frame: .zero, configuration: cfg)
        web.navigationDelegate = self
        web.scrollView.contentInsetAdjustmentBehavior = .always
        web.allowsBackForwardNavigationGestures = false
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

    private func jsString(_ s: String?) -> String {
        guard let s = s, let data = try? JSONSerialization.data(withJSONObject: [s]), let arr = String(data: data, encoding: .utf8) else { return "null" }
        return String(arr.dropFirst().dropLast())
    }

    private func startScript() -> String {
        let db = try? String(contentsOf: dbURL, encoding: .utf8)
        let pref = UserDefaults.standard.string(forKey: "rf_pref") ?? "{}"
        return """
        (function(){
          var S={db:\(jsString(db)),pref:\(jsString(pref))};
          var post=function(type,o){o=o||{};o.type=type;window.webkit.messageHandlers.native.postMessage(o)};
          window.__iosPref=function(p){S.pref=p};
          window.Native={load:function(){return S.db},save:function(s){S.db=s;post('save',{data:s})},
            bleConnect:function(){post('bleConnect')},bleMeasure:function(){post('bleMeasure')},
            savePdf:function(n,b){post('saveFile',{name:n,mime:'application/pdf',b64:b})},
            sharePdf:function(n,b){post('shareFile',{name:n,mime:'application/pdf',b64:b})},
            shareText:function(n,t){post('shareText',{name:n,text:t})}};
          window.Ble2={version:function(){return 25},connect:function(a,k,n){post('bleConnectTo',{addr:a,kind:k,name:n||''})},
            disconnect:function(){post('bleDisconnect')},forget:function(){S.pref='{}';post('bleForget')},preferred:function(){return S.pref}};
          window.Files={saveFile:function(n,m,b){post('saveFile',{name:n,mime:m,b64:b})},shareFile:function(n,m,b){post('shareFile',{name:n,mime:m,b64:b})}};
        })();
        """
    }

    func emit(_ json: String) {
        DispatchQueue.main.async { self.web.evaluateJavaScript("window.glmEvent&&window.glmEvent(\(json))", completionHandler: nil) }
    }

    private func toast(_ text: String) {
        DispatchQueue.main.async { self.web.evaluateJavaScript("typeof toast==='function'&&toast(\(self.jsString(text)))", completionHandler: nil) }
    }

    private func safeName(_ n: String) -> String {
        let bad = CharacterSet(charactersIn: "/\\:?*\"<>|")
        let s = n.components(separatedBy: bad).joined(separator: "-")
        return s.isEmpty ? "file" : String(s.prefix(100))
    }

    func userContentController(_ c: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let m = message.body as? [String: Any], let type = m["type"] as? String else { return }
        switch type {
        case "save":
            if let s = m["data"] as? String { try? s.write(to: dbURL, atomically: true, encoding: .utf8) }
        case "bleConnect": ble.start()
        case "bleMeasure": ble.measure()
        case "bleConnectTo":
            let addr = m["addr"] as? String ?? "", name = m["name"] as? String ?? ""
            let pref = "{\"addr\":\(jsString(addr)),\"kind\":\"ble\",\"name\":\(jsString(name))}"
            UserDefaults.standard.set(pref, forKey: "rf_pref")
            web.evaluateJavaScript("window.__iosPref&&window.__iosPref(\(jsString(pref)))", completionHandler: nil)
            ble.connect(id: addr, name: name)
        case "bleDisconnect": ble.stop(); emit("{\"type\":\"status\",\"state\":\"off\",\"text\":\"Дальномер отключён\"}")
        case "bleForget": UserDefaults.standard.removeObject(forKey: "rf_pref")
        case "saveFile", "shareFile", "shareText":
            let name = safeName(m["name"] as? String ?? "file")
            var data: Data?
            if let b = m["b64"] as? String { data = Data(base64Encoded: b) } else if let t = m["text"] as? String { data = t.data(using: .utf8) }
            guard let d = data else { toast("Файл не создан"); return }
            if type == "saveFile" {
                let dir = docs.appendingPathComponent("Выгрузки", isDirectory: true)
                try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
                let url = dir.appendingPathComponent(name)
                do { try d.write(to: url); toast("Сохранено: Файлы → На iPhone → Замер и смета → Выгрузки → \(name)") } catch { toast("Не удалось сохранить: \(error.localizedDescription)") }
            } else {
                let url = FileManager.default.temporaryDirectory.appendingPathComponent(name)
                do { try d.write(to: url) } catch { toast("Не удалось подготовить файл"); return }
                let vc = UIActivityViewController(activityItems: [url], applicationActivities: nil)
                vc.popoverPresentationController?.sourceView = view
                vc.popoverPresentationController?.sourceRect = CGRect(x: view.bounds.midX, y: view.bounds.maxY - 80, width: 1, height: 1)
                present(vc, animated: true)
            }
        default: break
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
