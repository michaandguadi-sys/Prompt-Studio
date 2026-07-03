"use client";

import React from "react";
import Image from "next/image";
import { Shield, Zap, Globe, Film } from "lucide-react";

interface CapabilitiesProps {
  serifFont: string;
  images: {
    editor: string;
    export4k: string;
    hero: string;
  };
}

export const Capabilities: React.FC<CapabilitiesProps> = ({ serifFont, images }) => {
  return (
    <section id="capabilities" className="py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-base font-semibold leading-7 text-[#6E7BFF] uppercase tracking-wider">Capabilities</h2>
          <p className="mt-2 text-3xl font-medium tracking-tight text-white sm:text-5xl" style={{ fontFamily: serifFont }}>
            Everything you need <br /><span className="text-white/40">to tell spatial stories.</span>
          </p>
        </div>

        <div className="mt-16 grid grid-cols-1 gap-4 sm:mt-20 lg:grid-cols-3 lg:grid-rows-2">
          {/* Main Feature - The Editor */}
          <div className="relative lg:col-span-2 lg:row-span-2">
            <div className="absolute inset-px rounded-3xl bg-white/[0.02] border border-white/5" />
            <div className="relative flex h-full flex-col overflow-hidden rounded-[calc(1.5rem-1px)]">
              <div className="px-8 pt-8 pb-3 sm:px-10 sm:pt-10">
                <p className="mt-2 text-lg font-medium tracking-tight text-white">Visual Studio</p>
                <p className="mt-2 max-w-lg text-sm text-white/40">
                  A high-performance workspace where prompts turn into motion. No keyframes required—just describe the shot.
                </p>
              </div>
              <div className="relative min-h-[30rem] w-full grow [container-type:size] max-lg:mx-auto max-lg:max-w-sm">
                <div className="absolute inset-x-10 bottom-0 top-10 overflow-hidden rounded-t-[12cqw] border-x-[3cqw] border-t-[3cqw] border-white/10 bg-black shadow-2xl">
                   <Image 
                    src={images.editor} 
                    alt="Mapanisy Editor" 
                    fill 
                    className="object-cover object-top"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Secondary Feature 1 - 4K Export */}
          <div className="relative lg:col-span-1">
            <div className="absolute inset-px rounded-3xl bg-white/[0.02] border border-white/5" />
            <div className="relative flex h-full flex-col overflow-hidden rounded-[calc(1.5rem-1px)]">
              <div className="px-8 pt-8 sm:px-10 sm:pt-10">
                <p className="mt-2 text-lg font-medium tracking-tight text-white">Broadcast 4K</p>
                <p className="mt-2 max-w-lg text-sm text-white/40">
                  Render in full 4K UHD, 24fps. Ready for TV, YouTube, or social media.
                </p>
              </div>
              <div className="relative flex flex-1 items-center justify-center px-8 pb-8 pt-10 sm:px-10 sm:pb-10 lg:pb-2">
                <div className="h-40 w-full overflow-hidden rounded-xl border border-white/5">
                   <Image 
                    src={images.export4k} 
                    alt="4K Export" 
                    fill 
                    className="object-cover"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Secondary Feature 2 - GPS/Data */}
          <div className="relative lg:col-span-1 mt-4 lg:mt-0">
             <div className="absolute inset-px rounded-3xl bg-white/[0.02] border border-white/5" />
            <div className="relative flex h-full flex-col overflow-hidden rounded-[calc(1.5rem-1px)]">
              <div className="px-8 pt-8 sm:px-10 sm:pt-10">
                <p className="mt-2 text-lg font-medium tracking-tight text-white">Data Integrated</p>
                <p className="mt-2 max-w-lg text-sm text-white/40">
                  Import GPX, TCX, or KML files directly. We handle the projection and terrain.
                </p>
              </div>
              <div className="flex flex-1 items-center [container-type:size] max-lg:py-6 lg:pb-2">
                <div className="mx-auto h-full w-full max-w-[15rem] overflow-hidden rounded-xl border border-white/5 relative">
                   <Image 
                    src={images.hero} 
                    alt="GPS Integration" 
                    fill 
                    className="object-cover"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
