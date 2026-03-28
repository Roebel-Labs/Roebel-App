"use client";

import { Check } from "lucide-react";
import { TicketDayModal } from "./TicketDayModal";

const ticketFeatures = [
  "Zugang zur kompletten Landesmeisterschaft - alle Kämpfe, alle Gewichtsklassen live vor Ort",

  "Beste Sitzplätze mit optimaler Sicht auf den Ring",
  "Exklusives Event-Programm und Teilnehmer-Übersicht",
];

export function TicketSection() {
  return (
    <section className="bg-[#000] py-12 md:py-24">
      <div className="mx-auto max-w-7xl px-6 md:px-12 lg:px-20">
        <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
          {/* Left Content */}
          <div>
            <h2 className="text-2xl text-center lg:text-left font-extrabold text-white md:text-3xl lg:text-4xl">
              
              Ticket kaufen und 
              <br />
              sei live dabei
            </h2>

            <p className="mt-4 text-sm text-center lg:text-left text-gray-400 md:mt-5 md:text-base">
              Das gesamte Event live online und von überall mitverfolgen und
              mitfiebern.
            </p>
          </div>

          {/* Right Content - Ticket Card matching design */}
          <div className="flex justify-center">
            <div className="w-full max-w-md overflow-hidden rounded-3xl">
              {/* Gold Header */}
              <div className="bg-gradient-to-r from-[#D0A023] via-[#FCEC7D] to-[#D0A023] px-5 py-2 text-center md:px-6 md:py-4">
                
                <span className="text-xs font-semibold text-black md:text-base">
                  Angebot für Röbeler
                </span>
              </div>

              {/* Dark Card Content */}
              <div className="rounded-b-3xl border-2 border-[#D0A023]/30 border-t-0 bg-gray-950 p-5 md:p-6">
                {/* Super Sports Header */}
                <div className="flex items-start justify-between">
                  <h3 className="text-xl font-bold text-[#D0A023] md:text-2xl">
                    Event Ticket
                  </h3>
                  <span className="rounded bg-red-600 px-2 py-1 text-[10px] font-bold text-white md:text-xs">
                    SPARE 40%
                  </span>
                </div>

                {/* Description */}
                <p className="mt-2 text-sm text-gray-300 md:text-base">
                  Erlebe die MV Boxen Landesmeisterschaft live vor Ort - mit
                  Zugang zu allen Kämpfen, Verpflegung und mehr.{" "}
                  <span className="text-gray-500">...Mehr</span>
                </p>

                {/* Price */}
                <div className="mt-4 flex items-baseline gap-2">
                  <span className="text-sm text-gray-500 line-through md:text-base">
                    €5.00
                  </span>
                  <span className="text-xl font-bold text-white md:text-2xl">
                    €2.99
                  </span>
                  <span className="text-sm text-gray-400">/Ticket</span>
                </div>

                {/* CTA Button */}
                <TicketDayModal>
                  <button className="mt-5 flex w-full items-center justify-center rounded-xl bg-gradient-to-r from-[#D0A023] to-[#FCEC7D] py-3 text-sm font-semibold text-black hover:opacity-90 transition-opacity md:mt-6 md:py-4 md:text-base">
                    Jetzt Ticket kaufen
                  </button>
                </TicketDayModal>

                {/* Features List */}
                <ul className="mt-6 space-y-3 md:mt-8 md:space-y-4">
                  {ticketFeatures.map((feature, index) => (
                    <li key={index} className="flex items-start gap-3">
                      <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-gray-400 md:h-5 md:w-5" />
                      <span className="text-sm text-gray-300 md:text-base">
                        {feature}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
