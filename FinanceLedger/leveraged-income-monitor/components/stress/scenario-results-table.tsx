import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Fund, Scenario } from "@/lib/types/models";
import { applyScenarioToFund } from "@/lib/utils/calculations";
import { formatCurrency, formatPercent } from "@/lib/utils";

export function ScenarioResultsTable({ funds, scenario }: { funds: Fund[]; scenario: Scenario }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Fund</TableHead>
          <TableHead>Stressed NAV</TableHead>
          <TableHead>Stressed MV</TableHead>
          <TableHead>Stressed Net Carry</TableHead>
          <TableHead>Stressed LTV</TableHead>
          <TableHead>Stressed Equity</TableHead>
          <TableHead>Margin Buffer</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Annualized ROE Carry</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {funds.map((fund) => {
          const result = applyScenarioToFund(fund, scenario);
          return (
            <TableRow key={fund.id}>
              <TableCell className="font-medium">{fund.fundName}</TableCell>
              <TableCell>{formatCurrency(result.stressedNav, fund.currency)}</TableCell>
              <TableCell>{formatCurrency(result.stressedMarketValue, fund.currency)}</TableCell>
              <TableCell>{formatCurrency(result.stressedNetCarry, fund.currency)}</TableCell>
              <TableCell>{formatPercent(result.stressedLtv)}</TableCell>
              <TableCell>{formatCurrency(result.stressedEquity, fund.currency)}</TableCell>
              <TableCell>{formatPercent(result.marginBufferRemaining)}</TableCell>
              <TableCell>
                {result.marginCallBreached ? (
                  <Badge variant="destructive">Margin call breach</Badge>
                ) : (
                  <Badge variant="success">Within buffer</Badge>
                )}
              </TableCell>
              <TableCell>{formatPercent(result.annualizedNetCarryOnEquity)}</TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
