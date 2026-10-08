# ai-3d-project

Floor-plan tracing, detection, and 3D visualization with a Python backend and Three.js frontend.

To open the application locally, run these commands from the project folder:

```sh
npm install
npm run dev
```

Keep that terminal running, then open [the 3D viewer](http://localhost:5173/index.html) or [the floor-plan tracer](http://localhost:5173/tracer.html). If Chrome shows `ERR_CONNECTION_REFUSED`, start `npm run dev` again. The development server stays on port 5173 so your browser's saved projects remain available at the same address. Image detection also needs the Python backend running.

Project documentation:

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
