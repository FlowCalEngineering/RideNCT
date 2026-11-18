        // ================================================================== //
        // 🚀 INITIALISATION GLOBALE                                          //
        // ================================================================== //
        document.addEventListener('DOMContentLoaded', () => AppStore.whenReady(() => {
            if ((typeof AppAuth !== 'undefined') && !AppAuth.has()) return;   // pas de compte : l'appli ne démarre pas (écran d'accès affiché par core/auth.js)
            ScreenWakeManager.init();
            AppManager.init();       
            ModuleDashboard.init();  
            ModuleGPS.init();
            ModuleIntercom.init();
            ModuleMaintenance.init(); try { ModuleReminders.init(); } catch (e) {}
            ModuleSecurity.init(); try { AppWarn.launch(); } catch (e) {}
            ModuleSettings.init();
            
            // Initialisation des nouveaux modules
            ModuleMusic.init();
            ModuleWeather.init();
            ModuleMapWeather.init();
            ModuleCommunity.init();
            ModuleProfile.init();
        }));
