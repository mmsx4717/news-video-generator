import React from "react";
import { Composition } from "remotion";
import edition from "../public/edition.json";
import { NewsVideo, Cover, type Edition } from "./Video";
const e = edition as Edition;
export const Root: React.FC = () => (
  <>
    <Composition
      id="NewsVideo"
      component={NewsVideo}
      durationInFrames={e.frames}
      fps={60}
      width={1920}
      height={1080}
      defaultProps={{ edition: e }}
    />
    <Composition
      id="Cover"
      component={Cover}
      durationInFrames={1}
      fps={60}
      width={1920}
      height={1080}
      defaultProps={{ edition: e }}
    />
  </>
);
