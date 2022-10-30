import React from "react";
import Link from "../Link";
import Footer from "./Footer";
import Navbar from "./Navbar";
import Section from "./Section";

export default function Layout(props: { children: React.ReactNode }) {
  return (
    <React.Fragment>
      <Navbar />
      {/* Fixed navbar space */}
      <div className="h-[70px] invisible" />
      <Section containerClass="bg-primary-300">
        <p className="p-2 text-sm text-center">
          We have added support for Ethereum.{" "}
          <Link to="/swap#">
            <b>TRADE NOW!</b>
          </Link>
        </p>
      </Section>
      <main className="h-screen">{props.children}</main>
      <Footer />
    </React.Fragment>
  );
}
