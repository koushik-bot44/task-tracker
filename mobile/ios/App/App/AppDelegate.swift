import UIKit
import Capacitor

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // Orbit Child: BGTaskScheduler identifiers must be registered before launch finishes.
        TrackerManager.shared.registerBackgroundTasks()
        // Every launch re-creates the location manager and resumes tracking when allowed.
        // This includes background relaunches by iOS after termination or a restart,
        // for a significant location change, a visit or a region exit
        // (launchOptions[.location]), and for a silent push (launchOptions[.remoteNotification]).
        TrackerManager.shared.bootstrap(launchOptions: launchOptions)
        return true
    }

    // MARK: - Remote notifications (APNs, silent "Locate Now" pushes)

    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        NotificationCenter.default.post(name: .capacitorDidRegisterForRemoteNotifications, object: deviceToken)
        TrackerManager.shared.didRegisterPushToken(deviceToken)
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications, object: error)
        TrackerManager.shared.didFailToRegisterPush(error)
    }

    func application(_ application: UIApplication,
                     didReceiveRemoteNotification userInfo: [AnyHashable: Any],
                     fetchCompletionHandler completionHandler: @escaping (UIBackgroundFetchResult) -> Void) {
        if TrackerManager.shared.handleRemoteNotification(userInfo, completion: completionHandler) {
            return
        }
        completionHandler(.noData)
    }

    // MARK: - Scenes (Capacitor 8 template)

    func application(_ application: UIApplication,
                     configurationForConnecting connectingSceneSession: UISceneSession,
                     options: UIScene.ConnectionOptions) -> UISceneConfiguration {
        let config = UISceneConfiguration(name: "Default Configuration",
                                          sessionRole: connectingSceneSession.role)
        config.delegateClass = SceneDelegate.self
        return config
    }
}
