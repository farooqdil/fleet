import React, { useState, useContext, useCallback } from "react";
import { Params } from "react-router/lib/Router";
import { useQuery } from "react-query";
import { Tab, Tabs, TabList, TabPanel } from "react-tabs";

import { pick } from "lodash";

import { NotificationContext } from "context/notification";
import deviceUserAPI from "services/entities/device_user";
import {
  IDeviceMappingResponse,
  IMacadminsResponse,
  IDeviceUserResponse,
  IHostDevice,
} from "interfaces/host";
import { ISoftware } from "interfaces/software";
import { IHostPolicy } from "interfaces/policy";
import { IDeviceGlobalConfig } from "interfaces/config";
import DeviceUserError from "components/DeviceUserError";
// @ts-ignore
import OrgLogoIcon from "components/icons/OrgLogoIcon";
import Spinner from "components/Spinner";
import Button from "components/buttons/Button";
import TabsWrapper from "components/TabsWrapper";
import InfoBanner from "components/InfoBanner";
import {
  normalizeEmptyValues,
  wrapFleetHelper,
  humanHostDiskEncryptionEnabled,
} from "utilities/helpers";

import HostSummaryCard from "../cards/HostSummary";
import AboutCard from "../cards/About";
import SoftwareCard from "../cards/Software";
import PoliciesCard from "../cards/Policies";
import InfoModal from "./InfoModal";

import InfoIcon from "../../../../../assets/images/icon-info-purple-14x14@2x.png";
import FleetIcon from "../../../../../assets/images/fleet-avatar-24x24@2x.png";
import PolicyDetailsModal from "../cards/Policies/HostPoliciesTable/PolicyDetailsModal";
import AutoEnrollMdmModal from "./AutoEnrollMdmModal";
import ManualEnrollMdmModal from "./ManualEnrollMdmModal";
import MacSettingsModal from "../MacSettingsModal";
import ResetKeyModal from "./ResetKeyModal";
import BootstrapPackageModal from "../HostDetailsPage/modals/BootstrapPackageModal";

const baseClass = "device-user";

interface IDeviceUserPageProps {
  params: Params;
}

interface IHostDiskEncryptionProps {
  enabled?: boolean;
  tooltip?: string;
}

const DeviceUserPage = ({
  params: { device_auth_token },
}: IDeviceUserPageProps): JSX.Element => {
  const deviceAuthToken = device_auth_token;
  const { renderFlash } = useContext(NotificationContext);

  const [isPremiumTier, setIsPremiumTier] = useState(false);
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [showEnrollMdmModal, setShowEnrollMdmModal] = useState(false);
  const [showResetKeyModal, setShowResetKeyModal] = useState(false);
  const [refetchStartTime, setRefetchStartTime] = useState<number | null>(null);
  const [showRefetchSpinner, setShowRefetchSpinner] = useState(false);
  const [hostSoftware, setHostSoftware] = useState<ISoftware[]>([]);
  const [
    hostDiskEncryption,
    setHostDiskEncryption,
  ] = useState<IHostDiskEncryptionProps>({});
  const [host, setHost] = useState<IHostDevice | null>();
  const [orgLogoURL, setOrgLogoURL] = useState("");
  const [selectedPolicy, setSelectedPolicy] = useState<IHostPolicy | null>(
    null
  );
  const [showPolicyDetailsModal, setShowPolicyDetailsModal] = useState(false);
  const [showMacSettingsModal, setShowMacSettingsModal] = useState(false);
  const [showBootstrapPackageModal, setShowBootstrapPackageModal] = useState(
    false
  );
  const [globalConfig, setGlobalConfig] = useState<IDeviceGlobalConfig | null>(
    null
  );

  const { data: deviceMapping, refetch: refetchDeviceMapping } = useQuery(
    ["deviceMapping", deviceAuthToken],
    () =>
      deviceUserAPI.loadHostDetailsExtension(deviceAuthToken, "device_mapping"),
    {
      enabled: !!deviceAuthToken,
      refetchOnMount: false,
      refetchOnReconnect: false,
      refetchOnWindowFocus: false,
      retry: false,
      select: (data: IDeviceMappingResponse) => data.device_mapping,
    }
  );

  const { data: deviceMacAdminsData } = useQuery(
    ["macadmins", deviceAuthToken],
    () => deviceUserAPI.loadHostDetailsExtension(deviceAuthToken, "macadmins"),
    {
      enabled: !!deviceAuthToken,
      refetchOnMount: false,
      refetchOnReconnect: false,
      refetchOnWindowFocus: false,
      retry: false,
      select: (data: IMacadminsResponse) => data.macadmins,
    }
  );

  const refetchExtensions = () => {
    deviceMapping !== null && refetchDeviceMapping();
  };

  const isRefetching = ({
    refetch_requested,
    refetch_critical_queries_until,
  }: IHostDevice) => {
    if (!refetch_critical_queries_until) {
      return refetch_requested;
    }

    const now = new Date();
    const refetchUntil = new Date(refetch_critical_queries_until);
    const isRefetchingCriticalQueries =
      !isNaN(refetchUntil.getTime()) && refetchUntil > now;
    return refetch_requested || isRefetchingCriticalQueries;
  };

  const {
    isLoading: isLoadingHost,
    error: loadingDeviceUserError,
    refetch: refetchHostDetails,
  } = useQuery<IDeviceUserResponse, Error, IDeviceUserResponse>(
    ["host", deviceAuthToken],
    () => deviceUserAPI.loadHostDetails(deviceAuthToken),
    {
      enabled: !!deviceAuthToken,
      refetchOnMount: false,
      refetchOnReconnect: false,
      refetchOnWindowFocus: false,
      retry: false,
      select: (data: IDeviceUserResponse) => data,
      onSuccess: (returnedHost: IDeviceUserResponse) => {
        setShowRefetchSpinner(isRefetching(returnedHost.host));
        setIsPremiumTier(returnedHost.license.tier === "premium");
        setHostSoftware(returnedHost.host.software ?? []);
        setHost(returnedHost.host);
        setHostDiskEncryption({
          enabled: returnedHost.host.disk_encryption_enabled,
          tooltip: humanHostDiskEncryptionEnabled(
            returnedHost.host.platform,
            returnedHost.host.disk_encryption_enabled
          ),
        });
        setOrgLogoURL(returnedHost.org_logo_url);
        setGlobalConfig(returnedHost.global_config);
        if (isRefetching(returnedHost.host)) {
          // If the API reports that a Fleet refetch request is pending, we want to check back for fresh
          // host details. Here we set a one second timeout and poll the API again using
          // fullyReloadHost. We will repeat this process with each onSuccess cycle for a total of
          // 60 seconds or until the API reports that the Fleet refetch request has been resolved
          // or that the host has gone offline.
          if (!refetchStartTime) {
            // If our 60 second timer wasn't already started (e.g., if a refetch was pending when
            // the first page loads), we start it now if the host is online. If the host is offline,
            // we skip the refetch on page load.
            if (returnedHost?.host.status === "online") {
              setRefetchStartTime(Date.now());
              setTimeout(() => {
                refetchHostDetails();
                refetchExtensions();
              }, 1000);
            } else {
              setShowRefetchSpinner(false);
            }
          } else {
            const totalElapsedTime = Date.now() - refetchStartTime;
            if (totalElapsedTime < 60000) {
              if (returnedHost?.host.status === "online") {
                setTimeout(() => {
                  refetchHostDetails();
                  refetchExtensions();
                }, 1000);
              } else {
                renderFlash(
                  "error",
                  `This host is offline. Please try refetching host vitals later.`
                );
                setShowRefetchSpinner(false);
              }
            } else {
              renderFlash(
                "error",
                `We're having trouble fetching fresh vitals for this host. Please try again later.`
              );
              setShowRefetchSpinner(false);
            }
          }
          // exit early because refectch is pending so we can avoid unecessary steps below
        }
      },
    }
  );

  const titleData = normalizeEmptyValues(
    pick(host, [
      "id",
      "status",
      "issues",
      "memory",
      "cpu_type",
      "os_version",
      "osquery_version",
      "enroll_secret_name",
      "detail_updated_at",
      "percent_disk_space_available",
      "gigs_disk_space_available",
      "team_name",
      "platform",
      "mdm",
    ])
  );

  const aboutData = normalizeEmptyValues(
    pick(host, [
      "seen_time",
      "uptime",
      "last_enrolled_at",
      "hardware_model",
      "hardware_serial",
      "primary_ip",
      "public_ip",
      "geolocation",
      "batteries",
      "detail_updated_at",
    ])
  );

  const toggleInfoModal = useCallback(() => {
    setShowInfoModal(!showInfoModal);
  }, [showInfoModal, setShowInfoModal]);

  const toggleEnrollMdmModal = useCallback(() => {
    setShowEnrollMdmModal(!showEnrollMdmModal);
  }, [showEnrollMdmModal, setShowEnrollMdmModal]);

  const toggleResetKeyModal = useCallback(() => {
    setShowResetKeyModal(!showResetKeyModal);
  }, [showResetKeyModal, setShowResetKeyModal]);

  const togglePolicyDetailsModal = useCallback(
    (policy: IHostPolicy) => {
      setShowPolicyDetailsModal(!showPolicyDetailsModal);
      setSelectedPolicy(policy);
    },
    [showPolicyDetailsModal, setShowPolicyDetailsModal, setSelectedPolicy]
  );

  const bootstrapPackageData = {
    status: host?.mdm.macos_setup?.bootstrap_package_status,
    details: host?.mdm.macos_setup?.details,
    name: host?.mdm.macos_setup?.bootstrap_package_name,
  };

  const toggleMacSettingsModal = useCallback(() => {
    setShowMacSettingsModal(!showMacSettingsModal);
  }, [showMacSettingsModal, setShowMacSettingsModal]);

  const onCancelPolicyDetailsModal = useCallback(() => {
    setShowPolicyDetailsModal(!showPolicyDetailsModal);
    setSelectedPolicy(null);
  }, [showPolicyDetailsModal, setShowPolicyDetailsModal, setSelectedPolicy]);

  const onRefetchHost = async () => {
    if (host) {
      setShowRefetchSpinner(true);
      try {
        await deviceUserAPI.refetch(deviceAuthToken);
        setRefetchStartTime(Date.now());
        setTimeout(() => {
          refetchHostDetails();
          refetchExtensions();
        }, 1000);
      } catch (error) {
        console.log(error);
        renderFlash("error", `Host "${host.display_name}" refetch error`);
        setShowRefetchSpinner(false);
      }
    }
  };

  const renderActionButtons = () => {
    return (
      <div className={`${baseClass}__action-button-container`}>
        <Button onClick={() => setShowInfoModal(true)} variant="text-icon">
          <>
            Info <img src={InfoIcon} alt="Host info icon" />
          </>
        </Button>
      </div>
    );
  };

  const turnOnMdmButton = (
    <Button variant="unstyled" onClick={toggleEnrollMdmModal}>
      <b>Turn on MDM</b>
    </Button>
  );

  const renderEnrollMdmModal = () => {
    return host?.dep_assigned_to_fleet ? (
      <AutoEnrollMdmModal onCancel={toggleEnrollMdmModal} />
    ) : (
      <ManualEnrollMdmModal
        onCancel={toggleEnrollMdmModal}
        token={deviceAuthToken}
      />
    );
  };

  const resetKeyButton = (
    <Button variant="unstyled" onClick={toggleResetKeyModal}>
      <b>Reset key</b>
    </Button>
  );

  const renderDeviceUserPage = () => {
    const failingPoliciesCount = host?.issues?.failing_policies_count || 0;
    const isMdmUnenrolled =
      host?.mdm.enrollment_status === "Off" || !host?.mdm.enrollment_status;

    const diskEncryptionBannersEnabled =
      globalConfig?.mdm.enabled_and_configured && host?.mdm.name === "Fleet";

    const showDiskEncryptionLogoutRestart =
      diskEncryptionBannersEnabled &&
      host?.mdm.macos_settings?.disk_encryption === "action_required" &&
      host?.mdm.macos_settings?.action_required === "log_out";
    const showDiskEncryptionKeyResetRequired =
      diskEncryptionBannersEnabled &&
      host?.mdm.macos_settings?.disk_encryption === "action_required" &&
      host?.mdm.macos_settings?.action_required === "rotate_key";

    return (
      <div className="fleet-desktop-wrapper">
        {isLoadingHost ? (
          <Spinner />
        ) : (
          <div className={`${baseClass} body-wrap`}>
            {host?.platform === "darwin" &&
              isMdmUnenrolled &&
              globalConfig?.mdm.enabled_and_configured && (
                // Turn on MDM banner
                <InfoBanner color="yellow" cta={turnOnMdmButton}>
                  Mobile device management (MDM) is off. MDM allows your
                  organization to change settings and install software. This
                  lets your organization keep your device up to date so you
                  don’t have to.
                </InfoBanner>
              )}
            {showDiskEncryptionLogoutRestart && (
              // MDM - Disk Encryption: Logout or restart banner
              <InfoBanner color="yellow">
                Disk encryption: Log out of your device or restart to turn on
                disk encryption. Then, select <strong>Refetch</strong>. This
                prevents unauthorized access to the information on your device.
              </InfoBanner>
            )}
            {showDiskEncryptionKeyResetRequired && (
              // MDM - Disk Encryption: Reset key required banner
              <InfoBanner color="yellow" cta={resetKeyButton}>
                Disk encryption: Reset your disk encryption key. This lets your
                organization help you unlock your device if you forget your
                password.
              </InfoBanner>
            )}
            <HostSummaryCard
              titleData={titleData}
              diskEncryption={hostDiskEncryption}
              bootstrapPackageData={bootstrapPackageData}
              isPremiumTier={isPremiumTier}
              toggleMacSettingsModal={toggleMacSettingsModal}
              hostMacSettings={host?.mdm.profiles ?? []}
              mdmName={deviceMacAdminsData?.mobile_device_management?.name}
              showRefetchSpinner={showRefetchSpinner}
              onRefetchHost={onRefetchHost}
              renderActionButtons={renderActionButtons}
              deviceUser
            />
            <TabsWrapper>
              <Tabs>
                <TabList>
                  <Tab>Details</Tab>
                  <Tab>Software</Tab>
                  {isPremiumTier && (
                    <Tab>
                      <div>
                        {failingPoliciesCount > 0 && (
                          <span className="count">{failingPoliciesCount}</span>
                        )}
                        Policies
                      </div>
                    </Tab>
                  )}
                </TabList>
                <TabPanel>
                  <AboutCard
                    aboutData={aboutData}
                    deviceMapping={deviceMapping}
                    munki={deviceMacAdminsData?.munki}
                    wrapFleetHelper={wrapFleetHelper}
                  />
                </TabPanel>
                <TabPanel>
                  <SoftwareCard
                    isLoading={isLoadingHost}
                    software={hostSoftware}
                    deviceUser
                    hostId={host?.id || 0}
                    pathname={location.pathname}
                  />
                </TabPanel>
                {isPremiumTier && (
                  <TabPanel>
                    <PoliciesCard
                      policies={host?.policies || []}
                      isLoading={isLoadingHost}
                      deviceUser
                      togglePolicyDetailsModal={togglePolicyDetailsModal}
                    />
                  </TabPanel>
                )}
              </Tabs>
            </TabsWrapper>
            {showInfoModal && <InfoModal onCancel={toggleInfoModal} />}
            {showEnrollMdmModal && renderEnrollMdmModal()}
            {showResetKeyModal && (
              <ResetKeyModal
                onClose={toggleResetKeyModal}
                deviceAuthToken={deviceAuthToken}
              />
            )}
          </div>
        )}
        {!!host && showPolicyDetailsModal && (
          <PolicyDetailsModal
            onCancel={onCancelPolicyDetailsModal}
            policy={selectedPolicy}
          />
        )}
        {showMacSettingsModal && (
          <MacSettingsModal
            hostMacSettings={host?.mdm.profiles ?? []}
            onClose={toggleMacSettingsModal}
          />
        )}
        {showBootstrapPackageModal &&
          bootstrapPackageData.details &&
          bootstrapPackageData.name && (
            <BootstrapPackageModal
              packageName={bootstrapPackageData.name}
              details={bootstrapPackageData.details}
              onClose={() => setShowBootstrapPackageModal(false)}
            />
          )}
      </div>
    );
  };

  return (
    <div className="app-wrap">
      <nav className="site-nav-container">
        <div className="site-nav-content">
          <ul className="site-nav-list">
            <li className="site-nav-item dup-org-logo" key="dup-org-logo">
              <div className="site-nav-item__logo-wrapper">
                <div className="site-nav-item__logo">
                  <OrgLogoIcon className="logo" src={orgLogoURL || FleetIcon} />
                </div>
              </div>
            </li>
          </ul>
        </div>
      </nav>
      {loadingDeviceUserError ? <DeviceUserError /> : renderDeviceUserPage()}
    </div>
  );
};

export default DeviceUserPage;
