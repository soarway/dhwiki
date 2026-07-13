import { useState, useCallback } from 'react';
import { BotMessageSquare } from 'lucide-react';

interface CheckRow {
  item: string;
  standard: string;
}

interface Section {
  section: string;
  rows: CheckRow[];
}

const TABLE_DATA: Section[] = [
  {
    section: '基本信息',
    rows: [
      {
        item: '证照',
        standard:
          '营业执照、海关注册登记证书(或海关进出口收发货人备案回执)。',
      },
      {
        item: '组织架构图',
        standard:
          '公司组织架构图',
      },
    ],
  },
  {
    section: '进出口',
    rows: [
      {
        item: '关企合作',
        standard:
          '在发现异常、可疑的货物单据或者非法、可疑和不明货物涉及海关业务时，及时通知海关(没有特殊事项报告的，可以提供日常的汇报或沟通记录，并制作沟通记录的台账)。',
      },
      {
        item: '单证抽样',
        standard:
          '检查进出口单证资料；填写单证抽样统计表；\n要求：每大类贸易方式各10票，涵盖进口、出口',
      },
      {
        item: '单证纠错',
        standard:
          '内部纠错记录，提供一套完整的样本，包括发现错误、更正反馈等邮件或其他方式的沟通记录',
      },
      {
        item: '修撤单、报关差错',
        standard:
          '通过单一窗口(或者自行统计)查询并提供2023年度的删改单记录和报关差错记录',
      },
      {
        item: '单证保管证明',
        standard:
          '报关单证电子扫描件(包括正式报关单、单证、纸质委托、校验搞)\n系统加密证明(若为电子档扫描件保存)不能只是存在系统中，需逐票下载存档，或除报关系统以外对进出口单证数据另行备份；\n进出口单证归档交接、销毁、查阅、复印记录(若为纸质方式保存)；\n单证档案室照片、钥匙保管记录(若为纸质方式保存)',
      },
      {
        item: '海关证书文书',
        standard:
          '海关核发的所有证书、法律文书；包括稽查通知书等海关敲章文件。',
      },
      {
        item: '穿行测试',
        standard:
          '1票进口和1票出口，由下订单到付款/收款的系统流程和纸质文件，系统步骤至少涉及客户管理、合同管理、财务管理，关务管理，物流管理等方面',
      },
      {
        item: '加贸资料',
        standard:
          '加工贸易手册;核销报告;企业自盘报告',
      },
      {
        item: '减免税设备',
        standard:
          '管理制度、固定资产账册、管理清单;\n抽查10件近3年减免税设备。要求:(不足10件，全部查看):设备照片、卡片照片、单证，填写#减免税设备统计表',
      },
      {
        item: '涉证涉检',
        standard:
          '1、涉及出入境特殊物品的，审核特殊物品出入境卫生检疫审批单中的储存条件及拆检注意事项。\n2、特殊物品安全管理制度。\n3、企业进出境动植物及其产品的检疫监管台账。\n4、进出口食品的进口、出口记录抽查。\n5、法检台账。',
      },
      {
        item: '禁止类产品',
        standard:
          '建立禁止类产品合规审查机制，并提供相关记录(重点：内部如何普及要求，相关岗位如何审核把控)',
      },
      {
        item: '年度进出口记录',
        standard:
          '进出口收发货人：进出口总值；填写#进出口统计表(按照每种贸易形式的进口和出口汇总)',
      },
    ],
  },
  {
    section: '内审及整改',
    rows: [
      {
        item: '内审档案',
        standard:
          '要求:1份/年进出口活动内审档案，1份海关高级认证企业标准内审档案',
      },
      {
        item: '内审整改',
        standard:
          '内审报告中提到问题的整改，需负责关务的高管签字确认(或邮件汇报)',
      },
      {
        item: '日常责任追究',
        standard:
          '操作错误导致的处罚(包括口头警告、批评教育)，抽样1份',
      },
      {
        item: '海关处罚',
        standard:
          '2025年度受到海关处罚的相关资料(如有，需提供海关文书、相关单证、支付罚金的证明、整改证明',
      },
    ],
  },
  {
    section: '财务',
    rows: [
      {
        item: '审计报告',
        standard:
          '2025年度会计师事务所出具的审计报告',
      },
      {
        item: '工商年报',
        standard:
          '2025《企业年度报告书》',
      },
    ],
  },
  {
    section: '场所',
    rows: [
      {
        item: '场所相关合同',
        standard:
          '租赁合同/产权证、物业合同、保安合同、平面图',
      },
      {
        item: '巡检记录',
        standard:
          '办公场所、车间、仓库安保巡逻记录，抽取1份',
      },
	  {
        item: '钥匙',
        standard:
          '铂匙发放及同收的记录 抽取1份',
      },
	  {
        item: '监控时间证明',
        standard:
          '监控截图:回看60天以前的证明(截图涵盖视频日期和右下角当天电脑日期，监视器无日期的，手机百度"北京时间"，用另一部手机拍照证明。\n区域：人员和车辆出入口、单证存放区域。',
      },
	  {
        item: '访客登记',
        standard:
          '访客登记记录，访客车辆登记记录，各1份，需含对身份信息的检查。',
      },
    ],
  },
  
  {
    section: '人事',
    rows: [
      {
        item: '无犯罪证明/自我申明',
        standard:
          '文件:最1年无故意犯罪记录的证明1随申办在线开具无犯罪证明2非大陆籍人员:自我申明，需手写签名。\n人员:法定代表人(或被授权的公司负责人)、负责关务的高管、负责贸易安全的高管、财务部负责人、关务负责人、关务部全员、仓库负责人、仓库全员(敏感岗位可在公司制度中酌情自行定义)',
      },
      {
        item: '员工清单',
        standard:
          '含员工姓名+员工号+岗位+入职时间+停职/离职时间',
      },
      {
        item: '新入职员工档案',
        standard:
          '抽取3份(不足3份则全部提供)，包含:入职手续，背调记录，劳务合同，离职文件等',
      },
	  {
        item: '离职员工记录',
        standard:
          '抽取3份(不足3份则全部提供)，包含:工作证件、设备、信息系统(线上注销时间)、工作邮箱、钥匙',
      },
	  {
        item: '档案室/柜',
        standard:
          '员工档案室或档案柜照片，需上锁或门禁的证明',
      },
    ],
  },
  {
    section: '货物收发',
    rows: [
      {
        item: '门禁安全',
        standard:
          '仓库门禁装置照片、锁闭装置照片',
      },
      {
        item: '货物、区域标识',
        standard:
          '原材料与成品标识、保税与非保税标识、特殊物流如危险品分类存放照片;收货区、发货区标识、装卸区警示标志照片(划线或吊牌、立牌)',
      },
	  {
        item: '集装箱',
        standard:
          '装箱检查记录、施封前后的照片、封条检查记录;施封前后的照片最好选出口的集装箱，按“空箱->半箱->装满->关门上封(集装箱编号)->封条特写(封条号)”这样拍照取证。',
      },
	  {
        item: '封条',
        standard:
          '封条购买、保存、领用、作废记录、封条异常报告记录【记录抽取1份】PS:如企业没有购买封条，供应链中负有封条责任的商业伙伴提供封条管理制度。',
      },
	  {
        item: '存储安全',
        standard:
          '集装箱存储区域的隔离设施照片',
      },
	  {
        item: '发货、收货记录',
        standard:
          '收货:货物、物品单证记录;发货:购货订单或者装运订单记录;同一票驾驶人员身份核实记录[记录各抽取1份，均有签名/盖章]',
      },
	  {
        item: '溢短装',
        standard:
          '溢、短装和法检指标不合格等异常情况的应对记录[记录抽取1份，均有签名/盖章]',
      },
	  {
        item: '监装',
        standard:
          '出口安全：生型企业(或自己营理仓库的贸易公司)对出口货物、物品实施专人监装并保存相关记录的制度和记录;租赁仓库的贸易公司有义务告知和监督商业伙伴实施监装程序',
      },
    ],
  },
  {
    section: '运输工具',
    rows: [
      {
        item: '车辆、司机安全',
        standard:
          '运输工具检查+司机身份核实提前确认的记录[记录抽取1份】\n驾驶人员的培训记录',
      },
      {
        item: '场所、车辆安全',
        standard:
          '运输工具存储区域的隔离设施照片',
      },
    ],
  },
  {
    section: '商业伙伴',
    rows: [
      {
        item: '主要商业伙伴信息',
        standard:
          '填写#主要商业伙伴情况表(服务商3家、供应商5家、客户5家)',
      },
      {
        item: '初选评估',
        standard:
          '主要商业伙伴筛选评估记录、其AEO认证证书(如有)\n评审内容需包含:守法合规、贸易安全方面',
      },
      {
        item: '协议、告知书',
        standard:
          '与主要商业伙伴的合同/协议、补充协议或者告知书\n协议或告知书要求商业伙伴按照海关认证企业标准优化和完善贸易安全管理',
      },
      {
        item: '定期评估',
        standard:
          '主要商业伙伴定期的年度评估记录，评审内容需包含:守法合规、贸易安全方面。\n商业伙伴为AEO高认的，需重新查询其海关信用等级(截图涵盖查询日电脑日期)',
      },
    ],
  },
  {
    section: '培训',
    rows: [
      {
        item: '海关法律法规内部培训记录',
        standard:
          '要求文件:培训资料+培训计划+签到表/线上记录+培训效果(如会议纪要、培训照片);\n抽样数量:至少2次/年;\n人员范围:法定代表人(负责人)、总经理、负责关务的高级管理人员、关务负责人、关务部员工、负责贸易安全的高级管理人员]',
      },
      {
        item: '申报细则、操作规范培训',
        standard:
          '要求文件:培训资料+培训计划+签到表/线上记录+培训效果(如会议纪要、培训照片);\n抽样数量:至少2次/年;\n人员范围:关务负责人、关务部员工]',
      },
      {
        item: '信息安全培训记录',
        standard:
          '要求文件:培训资料+培训计划+签到表/线上记录+培训效果+培训照片(如有)\n抽样数量：至少1次/年；\n人员范围:配有电脑员工',
      },
	  {
        item: '国际贸易供应链中货物流安全培训',
        standard:
          '要求文件:培训资料+培训计划+签到表/线上记录+培训效果(如会议纪要、培训照片)。\n抽样数量：至少1次/年；\n人员范围:至少包含关务部、物流部(包括仓库全员)',
      },
	  {
        item: '危机管理培训',
        standard:
          '要求文件:培训资料+培训计划+签到表/线上记录+培训效果(如会议纪要、培训照片)。\n抽样数量：至少1次/年；\n人员范围:公司全员',
      },
    ],
  },
  {
    section: '结论',
    rows: [
      {
        item: '总体评估',
        standard:
          '综合以上各指标的评估结果，对企业总体合规状况作出评定（达标 / 基本达标 / 不达标）；列明主要不足项及整改建议，明确整改责任人和完成时限。',
      },
    ],
  },
];

type Status = 'pass' | 'fail' | null;

// 章节名称 → dir_tag 的映射（与 Sidebar.tsx aeoMenuItems 保持一致）
const SECTION_TO_DIR_TAG: Record<string, string> = {
  '基本信息': 'aeo_basic',
  '进出口': 'aeo_trade',
  '内审及整改': 'aeo_audit',
  '财务': 'aeo_finance',
  '场所': 'aeo_location',
  '人事': 'aeo_hr',
  '货物收发': 'aeo_cargo',
  '运输工具': 'aeo_vehicle',
  '商业伙伴': 'aeo_partner',
  '培训': 'aeo_training',
};

function getAuthHeaders(): HeadersInit {
  const token = localStorage.getItem('access_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function AEOHomePage() {
  // key: "sectionIndex-rowIndex"
  const [statusMap, setStatusMap] = useState<Record<string, Status>>({});
  const [detecting, setDetecting] = useState(false);
  const [detectProgress, setDetectProgress] = useState<string>('');

  const toggle = (key: string, val: 'pass' | 'fail') => {
    setStatusMap((prev) => ({
      ...prev,
      [key]: prev[key] === val ? null : val,
    }));
  };

  // 将某章节（按 section.section 名称）的所有行设置为同一状态
  const applySection = useCallback((sectionName: string, result: 'pass' | 'fail') => {
    setStatusMap((prev) => {
      const next = { ...prev };
      TABLE_DATA.forEach((section, si) => {
        if (section.section === sectionName) {
          section.rows.forEach((_, ri) => {
            next[`${si}-${ri}`] = result;
          });
        }
      });
      return next;
    });
  }, []);

  // 一键检测：触发所有章节插件，轮询结果并回写自评表
  const handleDetectAll = useCallback(async () => {
    setDetecting(true);
    setDetectProgress('正在启动各章节检测任务...');
    try {
      const res = await fetch('/api/aeo/plugins/run-all', {
        method: 'POST',
        headers: getAuthHeaders(),
      });
      if (!res.ok) {
        setDetectProgress('启动失败，请重试。');
        setDetecting(false);
        return;
      }
      const tasks: { section: string; task_id: string }[] = await res.json();

      // 并行轮询每个任务，逐个回写结果
      let finishedCount = 0;
      const total = tasks.length;

      const pollTask = async (section: string, taskId: string) => {
        const poll = async (): Promise<void> => {
          const r = await fetch(`/api/aeo/plugins/tasks/${taskId}`, { headers: getAuthHeaders() });
          if (!r.ok) { finishedCount++; return; }
          const data = await r.json();
          if (data.status === 'pending' || data.status === 'running') {
            return new Promise(resolve => setTimeout(() => resolve(poll()), 2000));
          }
          finishedCount++;
          // 找到 TABLE_DATA 中对应的章节名
          const sectionName = Object.entries(SECTION_TO_DIR_TAG).find(([, v]) => v === section)?.[0];
          if (sectionName && data.status === 'success') {
            applySection(sectionName, data.result?.result === 'pass' ? 'pass' : 'fail');
          }
          setDetectProgress(`检测进度：${finishedCount} / ${total} 个章节已完成`);
          if (finishedCount >= total) {
            setDetecting(false);
            setDetectProgress('');
          }
        };
        return poll();
      };

      tasks.forEach(({ section, task_id }) => pollTask(section, task_id));
    } catch {
      setDetectProgress('网络错误，请重试。');
      setDetecting(false);
    }
  }, [applySection]);

  return (
    <div className="flex-1 overflow-y-auto bg-[#f5f5f7]">
      {/* Top Bar */}
      <div className="h-14 bg-[#fbfbfd] border-b border-[#d2d2d7] flex items-center justify-between px-8">
        <h1 className="text-[21px] font-semibold text-[#1d1d1f]">AEO首页 — 海关认证要求自评表</h1>
        <div className="flex items-center gap-3">
          {detecting && detectProgress && (
            <span className="text-[13px] text-[#86868b]">{detectProgress}</span>
          )}
          <button
            onClick={handleDetectAll}
            disabled={detecting}
            className="px-5 py-1.5 bg-[#34c759] hover:bg-[#2eb350] disabled:opacity-60 rounded-lg transition-all duration-150 flex items-center gap-2 text-[14px] font-medium text-white"
          >
            <BotMessageSquare className="w-[16px] h-[16px]" strokeWidth={2} />
            {detecting ? '检测中...' : '一键检测'}
          </button>
        </div>
      </div>

      {/* Table container */}
      <div className="px-8 py-8">
        <div className="bg-white rounded-2xl shadow-sm border border-[#d2d2d7] overflow-hidden">
          {/* Table title */}
          <div className="bg-[#1d1d1f] px-6 py-4 text-center">
            <h2 className="text-[18px] font-semibold text-white tracking-wide">海关认证要求自评表</h2>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[13px]">
              {/* Header */}
              <thead>
                <tr className="bg-[#f5f5f7] border-b border-[#d2d2d7]">
                  <th className="px-4 py-3 text-left font-semibold text-[#1d1d1f] border-r border-[#d2d2d7] w-[120px] whitespace-nowrap">
                    指标
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-[#1d1d1f] border-r border-[#d2d2d7] w-[120px] whitespace-nowrap">
                    检查项
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-[#1d1d1f] border-r border-[#d2d2d7]">
                    精标准（具体要求）
                  </th>
                  <th className="px-4 py-3 text-center font-semibold text-[#34c759] border-r border-[#d2d2d7] w-[80px]">
                    达标
                  </th>
                  <th className="px-4 py-3 text-center font-semibold text-[#ff3b30] w-[80px]">
                    不达标
                  </th>
                </tr>
              </thead>

              <tbody>
                {TABLE_DATA.map((section, si) =>
                  section.rows.map((row, ri) => {
                    const key = `${si}-${ri}`;
                    const status = statusMap[key] ?? null;
                    const isLast = si === TABLE_DATA.length - 1 && ri === section.rows.length - 1;
                    const isConclusion = section.section === '结论';

                    return (
                      <tr
                        key={key}
                        className={[
                          'border-b border-[#d2d2d7]',
                          isLast ? 'border-b-0' : '',
                          ri % 2 === 0 ? 'bg-white' : 'bg-[#fafafa]',
                          isConclusion ? 'bg-[#fff9f0]' : '',
                        ].join(' ')}
                      >
                        {/* Section cell — only rendered on first row */}
                        {ri === 0 && (
                          <td
                            rowSpan={section.rows.length}
                            className="px-3 py-3 border-r border-[#d2d2d7] align-middle text-center"
                          >
                            <span
                              className={[
                                'inline-block px-2 py-1 rounded-lg text-[12px] font-semibold leading-snug',
                                isConclusion
                                  ? 'bg-[#ff9500]/15 text-[#c95000]'
                                  : 'bg-[#0071e3]/10 text-[#0058b0]',
                              ].join(' ')}
                            >
                              {section.section}
                            </span>
                          </td>
                        )}

                        {/* Check item */}
                        <td className="px-4 py-3 border-r border-[#d2d2d7] align-top font-medium text-[#1d1d1f] whitespace-nowrap">
                          {row.item}
                        </td>

                        {/* Standard */}
                        <td className="px-4 py-3 border-r border-[#d2d2d7] align-top text-[#3c3c43] leading-relaxed">
                          <span style={{ whiteSpace: 'pre-wrap' }}>{row.standard}</span>
                        </td>

                        {/* Pass checkbox */}
                        <td className="px-2 py-3 border-r border-[#d2d2d7] text-center align-middle">
                          <button
                            onClick={() => toggle(key, 'pass')}
                            className={[
                              'w-6 h-6 rounded-md border-2 transition-all duration-150 flex items-center justify-center mx-auto',
                              status === 'pass'
                                ? 'bg-[#34c759] border-[#34c759]'
                                : 'border-[#c7c7cc] hover:border-[#34c759]',
                            ].join(' ')}
                            title="标记为达标"
                          >
                            {status === 'pass' && (
                              <svg
                                className="w-3.5 h-3.5 text-white"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                                strokeWidth={3}
                              >
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                              </svg>
                            )}
                          </button>
                        </td>

                        {/* Fail checkbox */}
                        <td className="px-2 py-3 text-center align-middle">
                          <button
                            onClick={() => toggle(key, 'fail')}
                            className={[
                              'w-6 h-6 rounded-md border-2 transition-all duration-150 flex items-center justify-center mx-auto',
                              status === 'fail'
                                ? 'bg-[#ff3b30] border-[#ff3b30]'
                                : 'border-[#c7c7cc] hover:border-[#ff3b30]',
                            ].join(' ')}
                            title="标记为不达标"
                          >
                            {status === 'fail' && (
                              <svg
                                className="w-3.5 h-3.5 text-white"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                                strokeWidth={3}
                              >
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            )}
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Summary footer */}
          <SummaryFooter statusMap={statusMap} total={TABLE_DATA.flatMap((s) => s.rows).length} />
        </div>
      </div>
    </div>
  );
}

function SummaryFooter({
  statusMap,
  total,
}: {
  statusMap: Record<string, Status>;
  total: number;
}) {
  const values = Object.values(statusMap);
  const passCount = values.filter((v) => v === 'pass').length;
  const failCount = values.filter((v) => v === 'fail').length;
  const unchecked = total - passCount - failCount;

  return (
    <div className="border-t border-[#d2d2d7] bg-[#f5f5f7] px-6 py-4 flex items-center gap-8 text-[13px]">
      <span className="text-[#86868b]">共 {total} 项</span>
      <span className="flex items-center gap-1.5 text-[#34c759] font-medium">
        <span className="w-2.5 h-2.5 rounded-full bg-[#34c759] inline-block" />
        达标：{passCount} 项
      </span>
      <span className="flex items-center gap-1.5 text-[#ff3b30] font-medium">
        <span className="w-2.5 h-2.5 rounded-full bg-[#ff3b30] inline-block" />
        不达标：{failCount} 项
      </span>
      <span className="flex items-center gap-1.5 text-[#86868b]">
        <span className="w-2.5 h-2.5 rounded-full bg-[#c7c7cc] inline-block" />
        未评估：{unchecked} 项
      </span>
    </div>
  );
}
