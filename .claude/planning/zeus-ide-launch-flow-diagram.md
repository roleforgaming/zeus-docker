flowchart TD
    A[Open Zeus] --> B[Click Open in IDE]
    B --> C{Choose IDE option}

    %% Server (code-server) path
    C -->|Open server| S1[Build code-server URL from mapped project path and auth]
    S1 --> S4{Is code-server running?}
    S4 -->|Yes| S2[Open code-server in new browser tab]
    S4 -->|No| S5[Prompt to start code-server]
    S5 -->|User agrees| S6[Start code-server service via docker compose and internal API]
    S6 --> S2
    S5 -->|User cancels| S7[Show notification that code-server was not started]

    S2 --> S3[Browser focuses new tab]
    S3 --> S8{Did code-server respond?}
    S8 -->|Success| S9[Workspace opened in code-server for selected project]
    S8 -->|Timeout or error| S10[Show error toast with retry option]

    %% Local host IDE path
    C -->|Open local| L1[Check if host IDE helper is configured]
    L1 -->|Configured| L2[Map container workspace path to host path via volume]
    L2 --> L3[Trigger host IDE helper to run code on host]
    L3 --> L5[Show toast that project opened in local IDE]

    L1 -->|Not configured| L4[Show message that local IDE is not configured with link to setup instructions]

    %% Configuration entry point
    B -.-> CFG[Open Configure IDEs in settings]
    CFG --> CFG1[Set default IDE preference to server or local]
    CFG1 --> CFG2[Save settings and return to Zeus]
