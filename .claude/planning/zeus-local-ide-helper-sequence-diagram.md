flowchart TD
    subgraph Browser_Zeus[Browser: Zeus UI]
        A[User clicks Open local for workspace] --> B[Send request to backend with workspaceId]
    end

    subgraph Zeus_Backend[Zeus backend container]
        B --> C[Resolve workspaceId to container path at app slash workspaces slash id]
        C --> D[Map container path to host path using docker volume configuration]
        D --> E[Send open host IDE request with hostPath to helper]
    end

    subgraph Host_Helper[Host IDE helper service]
        E --> F{Is helper running?}
        F -->|No| G[Return error that host IDE helper is not reachable]
        F -->|Yes| H[Run IDE command such as code dot in hostPath]
        H --> I[Return success to backend]
    end

    G --> J[Backend returns message that local IDE is not configured with link target]
    I --> K[Backend returns message that project opened in host IDE]

    subgraph Browser_Result[Browser: Zeus UI result]
        J --> L[Show toast or modal that local IDE is not configured with link to instructions or settings]
        K --> M[Show toast that project opened in local IDE]
    end
