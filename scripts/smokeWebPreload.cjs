const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld(
  "assiniDesktop",
  Object.freeze({
    authToken: process.env.ASSINI_WEB_SMOKE_API_TOKEN,
    isPackaged: false,
    prototypeAuth: true
  })
);
