# ai-3d-project

Floor-plan tracing, detection, and 3D visualization with a Python backend and Three.js frontend.

To open the application locally, run these commands from the project folder:

```sh
npm install
npm run dev
```

Keep that terminal running. The development server stays on port 5173 so your browser's saved projects remain available at the same address. Login and image detection both need the Python backend running.

In a second terminal, start the backend using the project's Python environment:

```sh
npm run backend
```

Open [Sign in](http://localhost:5173/login.html). New users can create an email/password account. To create your administrator account, run `npm run admin:setup` in another terminal and enter your email, name and password. Sign in, then choose **Account → Admin dashboard** to see total users, recent activity and the user list. Existing accounts can be promoted using `npm run admin:setup -- --promote --email you@example.com`. Restart an old backend process after this update.

Google sign-in requires a Google OAuth Web Client ID. Email/password works immediately; see [account and Google setup](docs/accounts-and-admin.md) for configuration. The first administrator on an existing browser inherits its pre-login plans. Each account's new saved plans are kept separately on that device.

This command uses the project's `.venv311` Python environment. The development server forwards `/api` requests to `127.0.0.1:5050`, so the tracer and viewer use the same browser origin for API requests. If Auto Detect reports a health-check 500 while the page still loads, the backend may be stopped: run `npm run backend`. Check [backend health through the frontend](http://localhost:5173/api/health), then retry **Auto Detect** if a previous scan failed. Keep both terminals running. A deployed static build also needs `/api` routed to the Python backend.

Saving a 3D project:

- Click **Save project** below **Measurements** in the 3D viewer.
- Enter a name and choose **Save on this device** to keep the current project in this browser.
- Choose **Download backup** to keep a separate `.project.json` file, including walls, furniture, sizes, colours, finishes and the matching 2D builder source when available.
- To continue later, use **Open a saved project**, select the backup, then click **Open this project**. The replaced project is available through **Restore previous project**. Only one previous project is retained; use downloaded files to keep multiple projects.

Project documentation:

- [Login, Google sign-in and the administrator dashboard](docs/accounts-and-admin.md)

- [Code review and prioritized improvements](docs/code-review.md)
- [Zero-budget 3D asset integration plan, including SketchUp alternatives](docs/zero-budget-3d-plan.md)
- [Implemented free rendering improvements and verification](docs/rendering-improvements.md)
- [Wall detection fixes, verification, and zero-budget accuracy plan](docs/wall-detection-accuracy.md)
- [Printed dimensions, room areas, implemented fixes and remaining accuracy limits](docs/measurement-accuracy.md)
- [Automatically scan uploaded plans and apply printed room areas/wall spans to 3D geometry](docs/exact-plan-dimensions.md)
- [Verify model dimensions and walk at your own measured eye height](docs/model-scale-and-walk.md)
- [40 room finish options: ceilings, floors, wall panels and TV backdrops](docs/room-finishes.md)
- [All 12 ceiling types, height controls and walking clearance](docs/ceiling-types.md)
- [Place ceiling lights and mark selected wall panel areas directly in 3D](docs/lights-and-wall-areas.md)

The GLB/SketchUp catalog remains planned. The rendering improvements document describes the changes already implemented.
