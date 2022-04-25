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
