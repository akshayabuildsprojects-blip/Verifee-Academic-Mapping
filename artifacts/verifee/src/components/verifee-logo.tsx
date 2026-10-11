import verifeeLogo from "@/assets/verifee-logo.png?inline";

export default function VerifeeLogo({ className }: { className?: string }) {
  return <img className={className} src={verifeeLogo} alt="Verifee" />;
}
