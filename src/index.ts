import * as express from "express";
import { Server, CustomTransportStrategy } from "@nestjs/microservices";
import * as http from "http";
import { invokeAsync } from "./util";
import { Injectable, Controller } from "@nestjs/common";
import { MessagePattern } from "@nestjs/microservices";

export interface RpcMetadata {
  namespace: string;
}

// TODO: check if there is a better method to manually apply decorators
declare let __decorate: Function;

export const JSONRpcService = (metadata: RpcMetadata) => {
  return (constructor: Function) => {
    __decorate([Injectable(), Controller()], constructor);
    for (let key of Object.getOwnPropertyNames(constructor.prototype))
      if (key !== "constructor") {
        if (typeof constructor.prototype[key] === "function") {
          let dec = MessagePattern(metadata.namespace + "." + key);
          __decorate([dec], constructor.prototype, key, null);
        }
      }
  };
};

export interface JSONRPCServerOptions {
  /**
   * Listening port for the HTTP server
   */
  port: number;
  /**
   * Listening host (optional, defaults to any)
   */
  hostname?: string;
  /*
   * The path at which the JSON RPC endpoint should be mounted
   */
  path: string;
}

export class JSONRPCServer extends Server implements CustomTransportStrategy {
  public server: http.Server | null = null;

  constructor(private readonly options: JSONRPCServerOptions) {
    super();
  }

  public async listen(callback: () => void) {
    let app = express();

    app.post(this.options.path, express.json(), async (req, res) => {
      let handlers = this.getHandlers();

      let handler = this.getHandlerByPattern(req.body.method);
      if (handler == null) return res.status(404).json({ error: "Not Found" });
      let response = await handler(req.body.params)
        .then(res => res.toPromise())
        .then(
          value => ({ value }),
          error => ({ error })
        );

      if ("error" in response) res.status(500).json({ error: response.error.message });
      else res.status(200).json(response.value);
    });
    await invokeAsync(cb => {
      if (this.options.hostname != null)
        this.server = app.listen(this.options.port, this.options.hostname, cb);
      else this.server = app.listen(this.options.port, cb);
    });
    callback();
  }

  public async close() {
    await invokeAsync(cb => this.server && this.server.close(cb));
    // do nothing, maybe block further requests
  }
}
