const path = require("path");
const webpack = require("webpack");

module.exports = {
  entry: "./src/main.js",
  mode: "development",
  module: {
    rules: [
      {
        test: /\.(js|jsx)$/,
        exclude: /(node_modules|bower_components)/,
        loader: "babel-loader",
        options: { presets: ["@babel/env"] }
      },
      {
        test: /\.css$/,
        use: ["style-loader", "css-loader"]
      }
    ]
  },
  resolve: { extensions: ["*", ".js", ".jsx"] },
  output: {
    path: path.resolve(__dirname, "dist/"),
    publicPath: "/dist/",
    filename: "bundle.js"
  },
  devServer: {
    static: {
      directory: path.resolve(__dirname, "public"),
      serveIndex: true,
      watch: true
    },
    port: 8000,
    devMiddleware: {
      publicPath: "http://0.0.0.0:8000/dist/"
    }
  }
};
