import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useEscapeToClose } from '@/hooks/useEscapeToClose'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PageLoading } from '@/components/admin/ui/AdminPage'

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
    <section className="rounded-lg border border-border bg-card p-4 space-y-3">
      <h3 className="text-[14px] font-semibold text-foreground">{store.name}</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="field-label">Razão social</label>
          <Input type="text" value={legalName} onChange={(e) => setLegalName(e.target.value)} />
        </div>
        <div>
          <label className="field-label">CNPJ</label>
          <Input type="text" value={cnpj} onChange={(e) => setCnpj(e.target.value)} />
        </div>
        <div>
          {/* Compõe o fecho dos contratos ("Linhares/ES, Data: ..."). Não é
              fixo no código porque Teixeira de Freitas é BA. */}
          <label className="field-label">UF</label>
          <Input type="text" value={uf} onChange={(e) => setUf(e.target.value.replace(/[^a-zA-Z]/g, '').toUpperCase().slice(0, 2))}
            placeholder="ES" maxLength={2} />
        </div>
        <div className="sm:col-span-2">
          <label className="field-label">Endereço</label>
          <Input type="text" value={address} onChange={(e) => setAddress(e.target.value)} />
        </div>
        <div>
          <label className="field-label">E-mail da unidade</label>
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div>
          <label className="field-label">Telefone / WhatsApp</label>
          <Input type="text" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="27999999999" />
        </div>
        <div className="sm:col-span-2">
          <label className="field-label">Link do Google Maps</label>
          <Input type="text" value={mapsLink} onChange={(e) => setMapsLink(e.target.value)} placeholder="https://maps.app.goo.gl/..." />
        </div>

        {/* Quem assina pelo salão no Contrato de Profissional Parceiro — a
            qualificação do representante ("brasileira, solteira, empresária")
            continua fixa no template, só os dados variáveis vêm daqui. */}
        <div className="sm:col-span-2 pt-1">
          <p className="text-[13px] font-semibold text-foreground">Representante legal</p>
        </div>
        <div>
          <label className="field-label">Nome</label>
          <Input type="text" value={repName} onChange={(e) => setRepName(e.target.value)} />
        </div>
        <div>
          <label className="field-label">CPF</label>
          <Input type="text" value={repCpf} onChange={(e) => setRepCpf(e.target.value)} />
        </div>
        <div>
          <label className="field-label">RG</label>
          <Input type="text" value={repRg} onChange={(e) => setRepRg(e.target.value)} />
        </div>
        <div className="sm:col-span-2">
          <label className="field-label">Endereço residencial</label>
          <Input type="text" value={repAddress} onChange={(e) => setRepAddress(e.target.value)} />
        </div>
      </div>
      {/* Um "Salvar" por loja: cada unidade é um registro próprio em
          `stores`, e o toast diz qual foi salva. */}
      <div className="flex justify-end">
        <Button variant="secondary" size="sm" onClick={() => save.mutate()} disabled={save.isPending}>
          {save.isPending ? 'Salvando…' : `Salvar ${store.name}`}
        </Button>
      </div>
    </section>
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="dp-lojas-title">
      <div className="absolute inset-0 bg-ink-950/45 backdrop-blur-[2px] animate-in fade-in-0" onClick={onClose} />
      <div className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl border border-border bg-popover p-5 shadow-xl animate-in fade-in-0 zoom-in-[0.98] duration-150">
        <div className="pr-8">
          <h2 id="dp-lojas-title" className="text-[16px] font-semibold leading-tight tracking-tight text-foreground">Dados das lojas</h2>
          <p className="mt-1.5 text-[13px] text-muted-foreground">
            Razão social, CNPJ, endereço, contato e representante legal vão nos contratos gerados; o link do Maps vai nas mensagens de automação do RH.
          </p>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Fechar" className="absolute right-3 top-3">
          <X />
        </Button>

        <div className="mt-5">
          {isLoading ? (
            <PageLoading className="py-8" />
          ) : (
            <div className="space-y-3">
              {stores.map((s) => <StoreRow key={s.id} store={s} />)}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
