import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useEscapeToClose } from '@/hooks/useEscapeToClose'

interface StoreLegalData {
  id: string
  name: string
  legal_name: string | null
  cnpj: string | null
  legal_address: string | null
  maps_link: string | null
  uf: string | null
  representative_name: string | null
  representative_cpf: string | null
  representative_rg: string | null
  representative_address: string | null
  email: string | null
  phone: string | null
}

function StoreRow({ store }: { store: StoreLegalData }) {
  const queryClient = useQueryClient()
  const [legalName, setLegalName] = useState(store.legal_name ?? '')
  const [cnpj, setCnpj] = useState(store.cnpj ?? '')
  const [address, setAddress] = useState(store.legal_address ?? '')
  const [mapsLink, setMapsLink] = useState(store.maps_link ?? '')
  const [uf, setUf] = useState(store.uf ?? '')
  const [repName, setRepName] = useState(store.representative_name ?? '')
  const [repCpf, setRepCpf] = useState(store.representative_cpf ?? '')
  const [repRg, setRepRg] = useState(store.representative_rg ?? '')
  const [repAddress, setRepAddress] = useState(store.representative_address ?? '')
  const [email, setEmail] = useState(store.email ?? '')
  const [phone, setPhone] = useState(store.phone ?? '')

  useEffect(() => {
    setLegalName(store.legal_name ?? '')
    setCnpj(store.cnpj ?? '')
    setAddress(store.legal_address ?? '')
    setMapsLink(store.maps_link ?? '')
    setUf(store.uf ?? '')
    setRepName(store.representative_name ?? '')
    setRepCpf(store.representative_cpf ?? '')
    setRepRg(store.representative_rg ?? '')
    setRepAddress(store.representative_address ?? '')
    setEmail(store.email ?? '')
    setPhone(store.phone ?? '')
  }, [
    store.legal_name, store.cnpj, store.legal_address, store.maps_link, store.uf,
    store.representative_name, store.representative_cpf, store.representative_rg,
    store.representative_address, store.email, store.phone,
  ])

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('stores')
        .update({
          legal_name: legalName || null,
          cnpj: cnpj || null,
          legal_address: address || null,
          maps_link: mapsLink || null,
          uf: uf || null,
          representative_name: repName || null,
          representative_cpf: repCpf || null,
          representative_rg: repRg || null,
          representative_address: repAddress || null,
          email: email || null,
          phone: phone || null,
        })
        .eq('id', store.id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dp-stores-legal-data'] })
      toast.success(`Dados de ${store.name} salvos`)
    },
    onError: (err) => toast.error(`Erro ao salvar: ${err instanceof Error ? err.message : 'desconhecido'}`),
  })

  return (
    <div className="border border-border rounded-lg p-3 space-y-2">
      <p className="text-sm font-semibold text-foreground">{store.name}</p>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-[11px] text-muted-foreground mb-1">Razão social</label>
          <input type="text" value={legalName} onChange={(e) => setLegalName(e.target.value)}
            className="w-full px-2.5 py-1.5 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
        </div>
        <div>
          <label className="block text-[11px] text-muted-foreground mb-1">CNPJ</label>
          <input type="text" value={cnpj} onChange={(e) => setCnpj(e.target.value)}
            className="w-full px-2.5 py-1.5 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
        </div>
        <div>
          {/* Compõe o fecho dos contratos ("Linhares/ES, Data: ..."). Não é
              fixo no código porque Teixeira de Freitas é BA. */}
          <label className="block text-[11px] text-muted-foreground mb-1">UF</label>
          <input type="text" value={uf} onChange={(e) => setUf(e.target.value.replace(/[^a-zA-Z]/g, '').toUpperCase().slice(0, 2))}
            placeholder="ES" maxLength={2}
            className="w-full px-2.5 py-1.5 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
        </div>
        <div className="col-span-2">
          <label className="block text-[11px] text-muted-foreground mb-1">Endereço</label>
          <input type="text" value={address} onChange={(e) => setAddress(e.target.value)}
            className="w-full px-2.5 py-1.5 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
        </div>
        <div>
          <label className="block text-[11px] text-muted-foreground mb-1">E-mail da unidade</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
            className="w-full px-2.5 py-1.5 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
        </div>
        <div>
          <label className="block text-[11px] text-muted-foreground mb-1">Telefone / WhatsApp</label>
          <input type="text" value={phone} onChange={(e) => setPhone(e.target.value)}
            placeholder="27999999999"
            className="w-full px-2.5 py-1.5 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
        </div>
        <div className="col-span-2">
          <label className="block text-[11px] text-muted-foreground mb-1">Link do Google Maps</label>
          <input type="text" value={mapsLink} onChange={(e) => setMapsLink(e.target.value)}
            placeholder="https://maps.app.goo.gl/..."
            className="w-full px-2.5 py-1.5 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
        </div>

        {/* Quem assina pelo salão no Contrato de Profissional Parceiro — a
            qualificação do representante ("brasileira, solteira, empresária")
            continua fixa no template, só os dados variáveis vêm daqui. */}
        <div className="col-span-2 pt-1">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase">Representante legal</p>
        </div>
        <div>
          <label className="block text-[11px] text-muted-foreground mb-1">Nome</label>
          <input type="text" value={repName} onChange={(e) => setRepName(e.target.value)}
            className="w-full px-2.5 py-1.5 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
        </div>
        <div>
          <label className="block text-[11px] text-muted-foreground mb-1">CPF</label>
          <input type="text" value={repCpf} onChange={(e) => setRepCpf(e.target.value)}
            className="w-full px-2.5 py-1.5 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
        </div>
        <div>
          <label className="block text-[11px] text-muted-foreground mb-1">RG</label>
          <input type="text" value={repRg} onChange={(e) => setRepRg(e.target.value)}
            className="w-full px-2.5 py-1.5 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
        </div>
        <div className="col-span-2">
          <label className="block text-[11px] text-muted-foreground mb-1">Endereço residencial</label>
          <input type="text" value={repAddress} onChange={(e) => setRepAddress(e.target.value)}
            className="w-full px-2.5 py-1.5 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
        </div>
      </div>
      <button
        onClick={() => save.mutate()}
        disabled={save.isPending}
        className="px-3 py-1.5 rounded-lg border border-border text-xs font-medium hover:bg-surface-alt disabled:opacity-70"
      >
        {save.isPending ? 'Salvando...' : 'Salvar'}
      </button>
    </div>
  )
}

// Razão social/CNPJ/endereço por loja — placeholders {{razao_social}}/
// {{cnpj}}/{{endereco}} nos contratos gerados automaticamente (DP). Muda
// por unidade (confirmado com o usuário), sem tela de admin dedicada até
// agora — só usado aqui, na página de geração de contrato.
//
// Contato da unidade e representante legal entraram com o Contrato de
// Profissional Parceiro (2026-08-22), que qualifica o salão e quem assina
// por ele — {{email_salao}}, {{telefone_salao}}, {{representante_salao}} e
// os dados pessoais dele. Sem esses campos preenchidos a geração desse
// contrato é recusada pela edge function, com a lista do que falta.
//
// O link do Maps entrou depois (2026-07-27) e serve a outro consumidor: o
// placeholder {store_maps_link} das mensagens de automação do RH. Ficou aqui
// por ser o único lugar que já edita dado cadastral de loja.
export default function LojasDadosModal({ onClose }: { onClose: () => void }) {
  useEscapeToClose(onClose)

  const { data: stores = [], isLoading } = useQuery<StoreLegalData[]>({
    queryKey: ['dp-stores-legal-data'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('stores')
        .select('id, name, legal_name, cnpj, legal_address, maps_link, uf, representative_name, representative_cpf, representative_rg, representative_address, email, phone')
        .order('name')
      if (error) throw error
      return (data || []) as StoreLegalData[]
    },
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-foreground/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-card rounded-2xl shadow-2xl border border-border p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold text-foreground">Dados das lojas</h2>
            <p className="text-xs text-muted-foreground">Razão social, CNPJ, endereço, contato e representante legal vão nos contratos gerados; o link do Maps vai nas mensagens de automação do RH.</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-surface-alt text-muted-foreground shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground py-4">Carregando...</p>
        ) : (
          <div className="space-y-3">
            {stores.map((s) => <StoreRow key={s.id} store={s} />)}
          </div>
        )}
      </div>
    </div>
  )
}
