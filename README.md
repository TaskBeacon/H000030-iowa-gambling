# H000030 Iowa Gambling Task

HTML/browser preview of Iowa Gambling Task built with `psyflow-web`.
The stage order, deck outcome schedules, timeout behavior, and summary metrics are aligned to local `T000030-iowa-gambling`.

## Layout

- `main.ts`: task orchestration
- `config/config.yaml`: declarative config
- `src/controller.ts`: deck profiles and money update controller
- `src/run_trial.ts`: trial logic
- `src/utils.ts`: block/overall summary helpers

## Run

From `e:\xhmhc\TaskBeacon\psyflow-web`:

```powershell
npm install
npm run dev
```

Open:

```text
http://127.0.0.1:4173/?task=H000030-iowa-gambling
```

