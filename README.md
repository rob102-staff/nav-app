# ROB 102: Navigation Web App

Web app for autonomous navigation via path planning.

## Usage

The web app depends on NodeJS. Install it (on Ubuntu) using:
```bash
curl -fsSL https://deb.nodesource.com/setup_14.x | sudo -E bash -
sudo apt-get install -y nodejs
```
To build the app, do:
```bash
npm install
```
This only needs to be done once (or when the app is updated). To start the server, do:
```bash
npm run dev
```
Navigate to [`http://localhost:8000`](http://localhost:8000) to use the app.

# Deploying  the application to Github Pages

Before deploying, you must ensure that the production version of the application works.
To do so, first run

```bash
npm run build
```

which will build the production version of code. 
Once built, run

```bash
npm run serve
```

and navigate to the specified url to ensure that the production code works.

Once you've ensured the production code is working (its possible that dev code works and production code fails),
run 

```bash
npm run deploy
```

and the code will automatically be deployed to github pages.