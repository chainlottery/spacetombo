import React from "react";
import ReactDOM from "react-dom";
import App from "./App";
import "./assets/styles/global.scss";
import { ThemeProvider } from "@mui/material";
import { theme } from "./services/mui/createTheme";
import { ChainId, DAppProvider } from "@usedapp/core";

const DappConfig = {
  readOnlyChainId: ChainId.Mainnet,
  /*readOnlyUrls: {
    [ChainId.Mainnet]: `${import.meta.env.VITE_KOVAN_URL}`,
  },*/
};

console.log("START APP WITH", DappConfig);

ReactDOM.render(
  <React.StrictMode>
    <DAppProvider config={DappConfig}>
      <ThemeProvider theme={theme}>
        <App />
      </ThemeProvider>
    </DAppProvider>
  </React.StrictMode>,
  document.getElementById("root")
);
