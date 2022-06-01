import axios from "axios";
import open from "open";
import Conf from "conf";
import moment from "moment";

async function getAccessToken(
  oauth_client_id: string,
  conf: Conf
): Promise<string> {
  const deviceCodeResp = await axios.post(
    "https://github.com/login/device/code",
    {
      client_id: oauth_client_id,
      scope: "repo",
    },
    {
      headers: {
        Accept: "application/json",
      },
    }
  );

  if (deviceCodeResp.status != 200) {
    throw new Error(
      "Non 200 status response from https://github.com/login/device/code"
    );
  }

  const device_code = deviceCodeResp.data["device_code"];
  const user_code = deviceCodeResp.data["user_code"];
  const verification_uri: string = deviceCodeResp.data["verification_uri"];
  const interval: number = deviceCodeResp.data["interval"];

  console.log(`Enter the following code in your browser: ${user_code}`);

  open(verification_uri);

  let res2;
  do {
    await new Promise((resolve) => setTimeout(resolve, interval * 1000));
    res2 = await axios.post(
      "https://github.com/login/oauth/access_token",
      {
        client_id: oauth_client_id,
        device_code: device_code,
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
      },
      {
        headers: {
          Accept: "application/json",
        },
      }
    );
  } while (res2.data["error"] != undefined);

  const access_token: string = res2.data["access_token"];
  console.log("GETTING NEW ACCESS TOKEN: ");

  conf.set("ACCESS_TOKEN", access_token);
  conf.set("EXPIRES_AT", moment().add(6, "hours").toString()); // Tokens by default last 8 hours
  return access_token;
}

export { getAccessToken };
