/**
 * Agent Hub API Client - 瘦客户端通信层
 * 
 * 替代原本的本地本地 JSON 存储，将所有状态同步到云端。
 */

export interface AutomatonState {
    agent_id: string;
    heartbeat_interval_ms: number;
    consecutive_idles: number;
    daily_spent_usd: number;
    daily_spend_date: string;
    balance_usd: number;
    lifetime_spent_usd: number;
    lifetime_earned_usd: number;
    survival_tier: string;
}

export interface WalletState {
    balance_usd: number;
    lifetime_spent_usd: number;
    lifetime_earned_usd: number;
    survival_tier: string;
}

export interface EpisodicEvent {
    id: string;
    agent_id: string;
    event_type: string;
    content: string;
    created_at: number;
}

export interface ProceduralSOP {
    id: string;
    agent_id: string;
    trigger_condition: string;
    steps_json: string;
    created_at: number;
    updated_at: number;
}

export interface SoulHistory {
    id: string;
    agent_id: string;
    field_name: string;
    old_value?: string;
    new_value: string;
    reason?: string;
    created_at: number;
}

export class AutomatonApiClient {
    private baseUrl: string;
    public agentId: string;

    constructor(baseUrl: string, agentId: string) {
        this.baseUrl = baseUrl.replace(/\/$/, "");
        this.agentId = agentId;
    }

    setAgentId(newId: string) {
        this.agentId = newId;
    }

    async registerAgent(name: string, description: string = "Auto-registered via automaton-lifecycle"): Promise<{ id: string, name: string }> {
        // Send a request to Agent Hub to create a new agent
        return this.request<{ id: string, name: string }>("POST", `/api/v0.1/agents`, {
            name,
            description,
            agent_type: "openclaw"
        });
    }

    private async request<T>(method: string, path: string, body?: any): Promise<T> {
        const url = `${this.baseUrl}${path}`;
        const init: RequestInit = {
            method,
            headers: {
                "Content-Type": "application/json",
            },
        };
        if (body) {
            init.body = JSON.stringify(body);
        }

        const res = await fetch(url, init);
        if (!res.ok) {
            let errText = await res.text().catch(() => "");
            throw new Error(`API Error [${res.status}]: ${method} ${path} - ${errText}`);
        }
        return res.json() as Promise<T>;
    }

    // --- State & Wallet ---

    async getAutomatonState(): Promise<AutomatonState> {
        return this.request<AutomatonState>("GET", `/api/v0.1/agents/${this.agentId}/automaton_state`);
    }

    async updateAutomatonState(patch: Partial<AutomatonState>): Promise<AutomatonState> {
        return this.request<AutomatonState>("PATCH", `/api/v0.1/agents/${this.agentId}/automaton_state`, patch);
    }

    async getWallet(): Promise<WalletState> {
        return this.request<WalletState>("GET", `/api/v0.1/agents/${this.agentId}/wallet`);
    }

    async pingHeartbeat(): Promise<void> {
        return this.request<void>("POST", `/api/v0.1/agents/${this.agentId}/heartbeat`);
    }

    // --- Memory (Events & SOPs) ---

    async recordEvent(eventType: string, content: string): Promise<EpisodicEvent> {
        return this.request<EpisodicEvent>("POST", `/api/v0.1/agents/${this.agentId}/memory/events`, {
            event_type: eventType,
            content: content
        });
    }

    async getEvents(eventType?: string, limit: number = 10): Promise<EpisodicEvent[]> {
        const query = new URLSearchParams({ limit: limit.toString() });
        if (eventType) {
            query.append("event_type", eventType);
        }
        return this.request<EpisodicEvent[]>("GET", `/api/v0.1/agents/${this.agentId}/memory/events?${query.toString()}`);
    }

    async saveSop(triggerCondition: string, stepsJson: string): Promise<ProceduralSOP> {
        return this.request<ProceduralSOP>("POST", `/api/v0.1/agents/${this.agentId}/memory/sops`, {
            trigger_condition: triggerCondition,
            steps_json: stepsJson
        });
    }

    async getSops(): Promise<ProceduralSOP[]> {
        return this.request<ProceduralSOP[]>("GET", `/api/v0.1/agents/${this.agentId}/memory/sops`);
    }

    // --- Soul History ---

    async recordSoulHistory(fieldName: string, newValue: string, oldValue?: string, reason?: string): Promise<SoulHistory> {
        return this.request<SoulHistory>("POST", `/api/v0.1/agents/${this.agentId}/soul/history`, {
            field_name: fieldName,
            old_value: oldValue,
            new_value: newValue,
            reason: reason
        });
    }
}
