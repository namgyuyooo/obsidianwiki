import { AssistantCloudAPI, } from "./AssistantCloudAPI.js";
import { AssistantCloudAuthTokens } from "./AssistantCloudAuthTokens.js";
import { AssistantCloudRuns } from "./AssistantCloudRuns.js";
import { AssistantCloudThreads } from "./AssistantCloudThreads.js";
import { AssistantCloudFiles } from "./AssistantCloudFiles.js";
export class AssistantCloud {
    threads;
    auth;
    runs;
    files;
    telemetry;
    constructor(config) {
        const api = new AssistantCloudAPI(config);
        this.threads = new AssistantCloudThreads(api);
        this.auth = {
            tokens: new AssistantCloudAuthTokens(api),
        };
        this.runs = new AssistantCloudRuns(api);
        this.files = new AssistantCloudFiles(api);
        const t = config.telemetry;
        this.telemetry =
            t === false
                ? { enabled: false }
                : t === true || t === undefined
                    ? { enabled: true }
                    : { enabled: t.enabled !== false, ...t };
    }
}
//# sourceMappingURL=AssistantCloud.js.map