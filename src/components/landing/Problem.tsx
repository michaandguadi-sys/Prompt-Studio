"use client";

import React from "react";
import { X, Clock, PenTool, Layout } from "lucide-react";

interface ProblemProps {
  serifFont: string;
}

export const Problem: React.FC<ProblemProps> = ({ serifFont }) => {
  const problems = [
    {
      icon: Clock,
      title: "Complexity at Scale",
      description: "Motion graphics for maps usually take days of manual keyframing and research.",
    },
    {
      icon: PenTool,
      title: "Design Bottlenecks",
      description: "You're either a reporter with a story or a designer with the tools. Rarely both.",
    },
    {
      icon: Layout,
      title: "Fragmented Workflows",
      description: "Exporting GPS tracks, finding satellite imagery, and grading footage is a nightmare.",
    },
  ];

  return (
    <section className="relative overflow-hidden py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-base font-semibold leading-7 text-[#6E7BFF] uppercase tracking-wider">The Problem</h2>
          <p className="mt-2 text-3xl font-medium tracking-tight text-white sm:text-5xl" style={{ fontFamily: serifFont }}>
            Why map animations <br /><span className="text-white/40">traditionally suck.</span>
          </p>
          <p className="mt-6 text-lg leading-8 text-white/50">
            Current tools are built for designers, not stories. They demand technical mastery over creative vision.
          </p>
        </div>
        <div className="mx-auto mt-16 max-w-2xl sm:mt-20 lg:mt-24 lg:max-w-none">
          <dl className="grid max-w-xl grid-cols-1 gap-x-8 gap-y-16 lg:max-w-none lg:grid-cols-3">
            {problems.map((problem) => (
              <div key={problem.title} className="flex flex-col rounded-2xl border border-white/5 bg-white/[0.02] p-8 transition-colors hover:bg-white/[0.04]">
                <dt className="flex items-center gap-x-3 text-base font-semibold leading-7 text-white">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/5 shadow-sm ring-1 ring-white/10">
                    <problem.icon className="h-6 w-6 text-[#6E7BFF]" aria-hidden="true" />
                  </div>
                  {problem.title}
                </dt>
                <dd className="mt-4 flex flex-auto flex-col text-base leading-7 text-white/50">
                  <p className="flex-auto">{problem.description}</p>
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </section>
  );
};
